// Temporary: NCAA.com game box score sources. Removed before merge.
import fs from "node:fs";
fs.mkdirSync("probe-out", { recursive: true });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const get = async (u: string) => { const r = await fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(25000) }); return { s: r.status, url: r.url, t: await r.text() }; };
const id = "6642598";
for (const u of [
  `https://www.ncaa.com/game/${id}`,
  `https://www.ncaa.com/game/${id}/boxscore`,
  `https://data.ncaa.com/casablanca/game/${id}/boxscore.json`,
  `https://data.ncaa.com/casablanca/game/${id}/gameInfo.json`,
  `https://data.ncaa.com/casablanca/game/${id}/pbp.json`,
]) {
  try {
    const r = await get(u);
    const f = u.replace(/^https:\/\//, "").replace(/[^a-z0-9]+/gi, "_") + ".txt";
    fs.writeFileSync(`probe-out/${f}`, r.t);
    console.log("==", u, r.s, r.url, r.t.length, r.t.slice(0, 300).replace(/\s+/g, " "));
    const q = [...new Set(r.t.match(/[A-Za-z_]+_web[^"]{0,40}?sha256Hash%22%3A%22[0-9a-f]{64}/g) ?? [])].map((x) => x.replace(/sha256Hash%22%3A%22/, " ").replace(/%22.*? /, " "));
    if (q.length) console.log("  queries", q.slice(0, 20));
    const q2 = [...new Set(r.t.match(/"(?:operationName|meta)"\s*:\s*"[A-Za-z_]+"/g) ?? [])];
    if (q2.length) console.log("  ops", q2.slice(0, 20));
    const names = [...new Set(r.t.match(/NCAA_[A-Za-z_]+|Get[A-Z][A-Za-z]+_web/g) ?? [])];
    if (names.length) console.log("  names", names.slice(0, 30));
  } catch (e) { console.log(u, "ERR", (e as Error).message); }
}
