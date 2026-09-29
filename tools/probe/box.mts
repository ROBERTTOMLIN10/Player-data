// Temporary: why some Nuxt Sidearm rosters don't read. Removed before merge.
import { parseNuxtPayload } from "../../server/src/import/nuxtPayload.js";
for (const host of ["gostanford.com", "uclabruins.com", "clemsontigers.com", "ucfknights.com"]) {
  try {
    const res = await fetch(`https://${host}/sports/mens-soccer/roster`, { headers: { "user-agent": "Mozilla/5.0 (compatible; FAU men's soccer staff app)" } });
    const html = await res.text();
    console.log("==", host, res.status, res.url, html.length, "nuxt:", html.includes("__NUXT_DATA__"), "rosterPlayerId:", html.includes("rosterPlayerId"), "sidearm:", /sidearm/i.test(html));
    if (!html.includes("__NUXT_DATA__")) { console.log(html.slice(0, 600).replace(/\s+/g, " ")); continue; }
    const root = parseNuxtPayload(html) as any;
    console.log("top", Object.keys(root ?? {}), "pinia", Object.keys(root?.pinia ?? {}));
    const r = root?.pinia?.roster;
    console.log("roster keys", r && Object.keys(r), r?.roster && Object.keys(r.roster).slice(0, 5));
    const first = r?.roster && (Object.values(r.roster)[0] as any);
    console.log("first", first && Object.keys(first), JSON.stringify(first)?.slice(0, 800));
    const i = html.indexOf("mens-soccer/roster/");
    console.log("links sample", html.slice(i - 100, i + 200).replace(/\s+/g, " "));
  } catch (e) { console.log(host, "ERR", String(e)); }
}
