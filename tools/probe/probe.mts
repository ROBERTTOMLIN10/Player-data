// Temporary: how to read the remaining D1 teams' sites. Removed before merge.
import { parseNuxtPayload } from "../../server/src/import/nuxtPayload.js";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const teams: Record<string, string> = {
  ucf: "ucfknights.com", stanford: "gostanford.com", ucla: "uclabruins.com", clemson: "clemsontigers.com", virginia: "virginiasports.com",
  "virginia-tech": "hokiesports.com", "penn-st": "gopsusports.com", "san-diego-st": "goaztecs.com", "san-jose-st": "sjsuspartans.com",
  seattle: "goseattleu.com", northwestern: "nusports.com", "old-dominion": "odusports.com", "st-thomas-mn": "tommiesports.com",
  kentucky: "ukathletics.com", "notre-dame": "fightingirish.com", "south-carolina": "gamecocksonline.com", "stony-brook": "goseawolves.org",
  quinnipiac: "quinnipiacbobcats.com", "oral-roberts": "orugoldeneagles.com", "central-conn-st": "ccsubluedevils.com", bradley: "bradleybraves.com",
  "george-mason": "gomason.com", louisville: "gocards.com", syracuse: "cuse.com", "wake-forest": "godeacs.com", colgate: "gocolgateraiders.com",
  "ga-southern": "gseagles.com", "george-washington": "gwsports.com", uiw: "uiwcardinals.com",
};
const only = process.argv[2];
for (const [seo, host] of Object.entries(teams)) {
  if (only && seo !== only) continue;
  for (const path of ["/sports/mens-soccer/roster", "/sports/mens-soccer/stats/2026"]) {
    try {
      const res = await fetch(`https://${host}${path}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
      const html = await res.text();
      const marks = ["__NUXT_DATA__", "oas-", "sidearm", "wmt", "roster-card-item", "roster-table", "sidearm-roster-player", "s-person-card", "wmt.games", "boxscore"].filter((m) => html.includes(m));
      console.log(`== ${seo} ${path} ${res.status} ${res.url} ${html.length} [${marks.join(",")}]`);
      const games = [...new Set(html.match(/https?:\/\/[a-z.]*wmt\.games[^"'\s<>]*/g) ?? [])].slice(0, 4);
      if (games.length) console.log("  wmt.games:", games);
      const apis = [...new Set(html.match(/https?:\/\/[a-z0-9.-]*(api|cdn)[a-z0-9.-]*\.[a-z]+\/[^"'\s<>]{0,60}/g) ?? [])].slice(0, 8);
      if (apis.length) console.log("  apis:", apis);
      if (path.includes("roster") && html.includes("__NUXT_DATA__")) {
        const root = parseNuxtPayload(html) as any;
        const pin = root?.pinia ?? {};
        console.log("  pinia:", Object.keys(pin).join(" "));
        const data = root?.data ?? {};
        console.log("  data keys:", Object.keys(data).slice(0, 10).join(" | "));
        for (const [k, v] of Object.entries(data).slice(0, 6)) console.log("   ", k, JSON.stringify(v)?.slice(0, 700));
      }
      if (!html.includes("__NUXT_DATA__") && res.ok) {
        const i = html.search(/roster|player/i);
        console.log("  snippet:", html.slice(Math.max(0, i - 200), i + 600).replace(/\s+/g, " "));
      }
    } catch (e) { console.log(`== ${seo} ${path} ERR ${(e as Error).message} ${(e as any).cause?.code ?? ""}`); }
  }
}
