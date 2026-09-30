// Temporary: NCAA.com live game data + play-by-play. Removed before merge.
import fs from "node:fs";
import { fetchScoreboard } from "../../server/src/ncaa/client.js";
fs.mkdirSync("probe-out", { recursive: true });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const get = async (u: string) => { const r = await fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(25000) }); return [r.status, await r.text()] as const; };
const days = ["2026-09-30", "2026-09-29", "2026-10-02"];
const all = [];
for (const d of days) { try { const g = await fetchScoreboard(d); all.push(...g); console.log(d, g.length, g.map((x) => `${x.contestId}:${x.state}`).join(" ")); } catch (e) { console.log(d, "ERR", (e as Error).message); } }
const live = all.filter((g) => g.state === "I").slice(0, 2);
const final = all.find((g) => g.state === "F");
const pre = all.find((g) => g.state === "P");
fs.writeFileSync("probe-out/scoreboard.json", JSON.stringify(all.slice(0, 5), null, 1));
// All persisted query names on a game page.
const ids = [...live.map((g) => g.contestId), final?.contestId, pre?.contestId].filter(Boolean) as number[];
const [, page] = await get(`https://www.ncaa.com/game/${ids[0]}`);
const hashes = Object.fromEntries([...page.matchAll(/"([A-Za-z_]+(?:_web|_Web))":"([0-9a-f]{64})"/g)].map((m) => [m[1], m[2]]));
console.log("QUERIES", JSON.stringify(hashes, null, 1));
fs.writeFileSync("probe-out/page.html", page);
for (const pbpUrl of [`https://www.ncaa.com/game/${ids[0]}/play-by-play`]) { const [s, t] = await get(pbpUrl); console.log("PBP page", s, t.length); fs.writeFileSync("probe-out/pbp-page.html", t); }
for (const id of ids) {
  for (const [name, hash] of Object.entries(hashes)) {
    if (!/Gamecenter|Game/i.test(name)) continue;
    const url = `https://sdataprod.ncaa.com/?meta=${name}&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }))}&variables=${encodeURIComponent(JSON.stringify({ contestId: String(id), staticTestEnv: null }))}`;
    const [s, t] = await get(url);
    console.log(id, name, s, t.length, t.slice(0, 600).replace(/\s+/g, " "));
    fs.writeFileSync(`probe-out/${id}-${name}.json`, t);
  }
}
console.log("LIVE", live.map((g) => `${g.contestId} ${g.away.name} @ ${g.home.name} ${g.period} ${g.clock}`), "FINAL", final?.contestId, "PRE", pre?.contestId);
