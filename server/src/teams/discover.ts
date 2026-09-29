import { getDb } from "../db/connection.js";
import { fetchText } from "../ncaa/client.js";
import { standingsWithMovement } from "../ncaa/store.js";
import { teamToday } from "../lib/readiness.js";
import { classicRoster, nuxtRoster, siteFetch } from "./readers.js";
import { TEAM_SITES, type TeamPlatform } from "./sites.js";

/**
 * Finds every D1 team's athletics website (from its NCAA.com school page) and
 * which platform it runs, so their squads can be read. Teams on platforms we
 * can't read yet are stored as 'other' and retried monthly, in case they move.
 */

const REDISCOVER_DAYS = 30;
const CONCURRENCY = 8;

/** The athletics site linked from a school's NCAA.com page (the "web" link in its school links). */
export async function athleticsHost(seo: string): Promise<string | null> {
  const html = await fetchText(`https://www.ncaa.com/schools/${seo}`);
  const links = html.match(/class="school-links"[\s\S]*?<\/ul>/)?.[0] ?? "";
  const web = links.match(/href="(https?:\/\/[^"]+)"[^>]*>\s*<span class="icon-web"/)?.[1];
  return web ? new URL(web).hostname.replace(/^www\./, "").toLowerCase() : null;
}

/** Which reader works on a site: whichever gets a squad off its men's soccer roster page. */
export async function detectPlatform(host: string): Promise<{ host: string; platform: TeamPlatform | "other" }> {
  const res = await siteFetch(`https://${host}/sports/mens-soccer/roster`);
  const finalHost = new URL(res.url).hostname.replace(/^www\./, "");
  if (!res.ok) return { host: finalHost, platform: "other" };
  const html = await res.text();
  if (html.includes("__NUXT_DATA__") && (await nuxtRoster(finalHost, html).catch(() => [])).length) return { host: finalHost, platform: "sidearm" };
  if ((await classicRoster(finalHost, html).catch(() => [])).length) return { host: finalHost, platform: "sidearm-classic" };
  return { host: finalHost, platform: "other" };
}

/** Every D1 team this season (the NCAA.com conference standings). */
export function d1Teams(): string[] {
  const year = Number(teamToday().slice(0, 4));
  return [...new Set(standingsWithMovement(year).flatMap((c) => c.rows.map((r) => r.seo)))];
}

/** Runs `fn` over `items`, `n` at a time. */
export async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
  }));
}

/** Finds the site and platform for D1 teams not looked up yet (or not readable last time, monthly). */
export async function discoverTeamSites(): Promise<{ checked: number; readable: number }> {
  const db = getDb();
  const known = new Map(
    (db.prepare("SELECT team_seo, platform, discovered_at FROM team_sites").all() as { team_seo: string; platform: string; discovered_at: string | null }[]).map(
      (r) => [r.team_seo, r],
    ),
  );
  const stale = (at: string | null) => !at || Date.now() - Date.parse(`${at.replace(" ", "T")}Z`) > REDISCOVER_DAYS * 86400_000;
  const todo = d1Teams().filter((seo) => {
    if (TEAM_SITES[seo]) return false; // checked by hand
    const k = known.get(seo);
    return !k || (k.platform === "other" && stale(k.discovered_at));
  });
  const save = db.prepare(
    `INSERT INTO team_sites (team_seo, host, platform, discovered_at, last_error) VALUES (?, ?, ?, datetime('now'), ?)
     ON CONFLICT(team_seo) DO UPDATE SET host = excluded.host, platform = excluded.platform, discovered_at = excluded.discovered_at,
       last_error = excluded.last_error`,
  );
  let readable = 0;
  await pool(todo, CONCURRENCY, async (seo) => {
    try {
      const found = await athleticsHost(seo);
      if (!found) {
        save.run(seo, "", "other", "No athletics site on the NCAA.com school page");
        return;
      }
      const { host, platform } = await detectPlatform(found);
      save.run(seo, host, platform, platform === "other" ? "Site platform not supported yet" : null);
      if (platform !== "other") readable++;
    } catch (err) {
      save.run(seo, "", "other", (err as Error).message.slice(0, 300));
    }
  });
  if (todo.length) console.log(`[teams] discovery: ${todo.length} checked, ${readable} readable`);
  return { checked: todo.length, readable };
}
