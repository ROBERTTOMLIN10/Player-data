import { getDb } from "../db/connection.js";
import { fetchText } from "../ncaa/client.js";
import { standingsWithMovement, teamsByName } from "../ncaa/store.js";
import { teamToday } from "../lib/readiness.js";
import { classicRoster, nuxtRoster, siteFetch } from "./readers.js";
import { TEAM_SITES, type TeamPlatform } from "./sites.js";
import { wmtDirectory, wmtName, wmtTeamIdFromPage } from "./wmt.js";

/**
 * Finds every D1 team's athletics website (from its NCAA.com school page) and
 * which platform it runs, so their squads can be read. Teams whose own site
 * can't be read are looked up in WMT's stats feed instead (squads and stats
 * without photos); anything left is stored as 'other' and retried daily.
 */

const REDISCOVER_DAYS = 1;
const CONCURRENCY = 8;

/** The athletics site linked from a school's NCAA.com page (the "web" link in its school links). */
export async function athleticsHost(seo: string): Promise<string | null> {
  const html = await fetchText(`https://www.ncaa.com/schools/${seo}`);
  const links = html.match(/class="school-links"[\s\S]*?<\/ul>/)?.[0] ?? "";
  const web = links.match(/href="(https?:\/\/[^"]+)"[^>]*>\s*<span class="icon-web"/)?.[1];
  return web ? new URL(web).hostname.replace(/^www\./, "").toLowerCase() : null;
}

export interface Detected {
  host: string;
  platform: TeamPlatform | "other";
  statsTeamId?: number | null; // WMT team id
  rosterUrl?: string | null; // WMT sites: where the roster page is (its path varies)
}

/** Which reader works on a site: whichever gets a squad off its men's soccer roster page. */
export async function detectPlatform(host: string): Promise<Detected> {
  let finalHost = host;
  for (const path of ["/sports/mens-soccer/roster", "/sports/msoc/roster/"]) {
    const res = await siteFetch(`https://${host}${path}`);
    finalHost = new URL(res.url).hostname.replace(/^www\./, "");
    if (!res.ok) continue;
    const html = await res.text();
    if (html.includes("__NUXT_DATA__") && (await nuxtRoster(finalHost, html).catch(() => [])).length) return { host: finalHost, platform: "sidearm" };
    if ((await classicRoster(finalHost, html).catch(() => [])).length) return { host: finalHost, platform: "sidearm-classic" };
    // WMT sites: stats come from WMT's feed, photos from this page.
    if (/players-list|wmt-stats-app|wmt\.games/.test(html)) return { host: finalHost, platform: "wmt", statsTeamId: wmtTeamIdFromPage(html), rosterUrl: res.url };
  }
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

/** Finds the site and platform for D1 teams not looked up yet (or not readable last time). */
export async function discoverTeamSites(): Promise<{ checked: number; readable: number }> {
  const db = getDb();
  const year = Number(teamToday().slice(0, 4));
  const known = new Map(
    (
      db.prepare("SELECT team_seo, host, platform, discovered_at, stats_team_id FROM team_sites").all() as {
        team_seo: string;
        host: string;
        platform: string;
        discovered_at: string | null;
        stats_team_id: number | null;
      }[]
    ).map((r) => [r.team_seo, r]),
  );
  const stale = (at: string | null) => !at || Date.now() - Date.parse(`${at.replace(" ", "T")}Z`) > REDISCOVER_DAYS * 86400_000;
  // WMT team ids are per season: look them up again once a new season starts.
  const lastSeason = (at: string | null) => !at || at < `${year}-08-01`;
  const todo = d1Teams().filter((seo) => {
    if (TEAM_SITES[seo]) return false; // checked by hand
    const k = known.get(seo);
    // Teams we can't read yet are looked up again daily (a site move, or a network error last time).
    return (
      !k ||
      (k.platform === "other" && stale(k.discovered_at)) ||
      (k.platform === "wmt" && (!k.stats_team_id || lastSeason(k.discovered_at)))
    );
  });
  const save = db.prepare(
    `INSERT INTO team_sites (team_seo, host, platform, stats_team_id, roster_url, discovered_at, last_error)
     VALUES (@seo, @host, @platform, @statsTeamId, @rosterUrl, datetime('now'), @error)
     ON CONFLICT(team_seo) DO UPDATE SET host = excluded.host, platform = excluded.platform, stats_team_id = excluded.stats_team_id,
       roster_url = excluded.roster_url, discovered_at = excluded.discovered_at, last_error = excluded.last_error`,
  );
  const found = new Map<string, Detected & { error: string | null }>();
  await pool(todo, CONCURRENCY, async (seo) => {
    try {
      const site = await athleticsHost(seo);
      if (!site) return void found.set(seo, { host: "", platform: "other", error: "No athletics site on the NCAA.com school page" });
      const d = await detectPlatform(site);
      found.set(seo, { ...d, error: d.platform === "other" ? "Site platform not supported yet" : null });
    } catch (err) {
      found.set(seo, { host: "", platform: "other", error: (err as Error).message.slice(0, 300) });
    }
  });

  // Teams we can't read from their own site (or WMT sites whose page didn't give the id): find them in WMT's feed.
  const needId = [...found].filter(([, d]) => d.platform === "other" || (d.platform === "wmt" && !d.statsTeamId)).map(([seo]) => seo);
  {
    const names = new Map([...teamsByName(year).values()].map((t) => [t.seo, t.name]));
    const seeds = [
      ...[...found.values()].map((d) => d.statsTeamId ?? 0),
      ...[...known.values()].filter((k) => !lastSeason(k.discovered_at)).map((k) => k.stats_team_id ?? 0),
    ].filter(Boolean);
    try {
      // Every D1 name, so the directory also covers teams whose own site stops working later.
      const wanted = [...names.values()];
      const dir = seeds.length ? await wmtDirectory(seeds, wanted, year) : new Map<string, number>();
      for (const seo of needId) {
        const id = dir.get(wmtName(names.get(seo) ?? ""));
        const d = found.get(seo)!;
        if (id) found.set(seo, { ...d, platform: "wmt", statsTeamId: id, error: null });
      }
    } catch (err) {
      console.error(`[teams] WMT lookup failed: ${(err as Error).message}`);
    }
  }

  let readable = 0;
  for (const [seo, d] of found) {
    save.run({ seo, host: d.host, platform: d.platform, statsTeamId: d.statsTeamId ?? null, rosterUrl: d.rosterUrl ?? null, error: d.error });
    if (d.platform !== "other") readable++;
  }
  if (todo.length) console.log(`[teams] discovery: ${todo.length} checked, ${readable} readable`);
  return { checked: todo.length, readable };
}
