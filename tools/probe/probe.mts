// Temporary: NCAA.com gamecenter queries (v2). Removed before merge.
import fs from "node:fs";
fs.mkdirSync("probe-out", { recursive: true });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const Q: Record<string, string> = {
  NCAA_GetGamecenterBoxscoreSoccerById_web: "c9070c4e5a76468a4025896df89f8a7b22be8275c54a22ff79619cbb27d63d7d",
  NCAA_GetGamecenterTeamStatsSoccerById_web: "d3009ee734557a3af9b80a1fd0326575799094e8046a4188c6aebea7072ea7bf",
  NCAA_GetGamecenterScoringSummaryById_web: "fcd5729c72b0f72a4f659bf07e7b1da0fdce8f41ad286b0ddfe830adc7a45ca3",
  GetGamecenterGameById_web: "26d14df5714c5cd454c9032a1f8ebb1b1dc35173065ab858709b0fa84dd07b5f",
};
for (const id of ["6642598", "6615655"]) {
  for (const [name, hash] of Object.entries(Q)) {
    for (const vars of [{ contestId: id, staticTestEnv: null }, { contestId: id }, { id }]) {
      const url = `https://sdataprod.ncaa.com/?meta=${name}&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }))}&variables=${encodeURIComponent(JSON.stringify(vars))}`;
      const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(25000) });
      const t = await r.text();
      const ok = r.ok && !t.includes('"errors"');
      console.log(id, name, JSON.stringify(vars), r.status, t.length, t.slice(0, ok ? 1500 : 200).replace(/\s+/g, " "));
      if (ok) { fs.writeFileSync(`probe-out/${id}-${name}.json`, t); break; }
    }
  }
}
