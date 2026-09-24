// Temporary: explores ranking sources from a runner with open internet. Removed before merge.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const get = async (u) => { try { const r = await fetch(u, { headers: { "User-Agent": UA } }); const t = await r.text(); return { status: r.status, url: r.url, t }; } catch (e) { return { status: 0, t: String(e) }; } };
const strip = (s) => s.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const r = await get("https://www.topdrawersoccer.com/college-soccer-national-rankings/men");
console.log("TDS", r.status, r.t.length);
const ts = [...r.t.matchAll(/<table[\s\S]*?<\/table>/g)]; console.log("TABLES", ts.length);
ts.slice(0, 2).forEach((m) => { console.log("RAW:", m[0].slice(0, 2500)); console.log("TEXT:", strip(m[0]).slice(0, 1200)); });
if (!ts.length) { const i = r.t.indexOf("Stanford"); console.log(r.t.slice(Math.max(0, i - 3000), i + 1500)); }
for (const m of r.t.matchAll(/<select[\s\S]*?<\/select>/g)) console.log("SELECT:", m[0].slice(0, 1500));
const hash = "4bcb5e6432fa9da365c0c19af01b1f9015cc7eb5c21e7af2dba308784a166df7";
for (const [y, md] of [[2025, "11/09"], [2025, "11/02"], [2025, "10/25"]]) {
  const u = `https://sdataprod.ncaa.com?meta=GetContests_web&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }))}&variables=${encodeURIComponent(JSON.stringify({ sportCode: "MSO", division: 1, seasonYear: y, contestDate: `${md}/${y}` }))}`;
  const j = JSON.parse((await get(u)).t);
  const cs = j.data.contests;
  console.log(`\n## ${md}/${y}: ${cs.length} contests. keys:`, Object.keys(cs[0]).join(","));
  console.log("SAMPLE:", JSON.stringify(cs[0]).slice(0, 2500));
  const conf = cs.filter((c) => c.teams[0].conferenceSeo && c.teams[0].conferenceSeo === c.teams[1].conferenceSeo);
  console.log("conf games:", conf.length, conf.slice(0, 6).map((c) => `${c.teams.map((t) => t.seoname).join(" v ")} [${Object.entries(c).filter(([k, v]) => typeof v !== "object").map(([k, v]) => `${k}=${v}`).join(" ")}]`).join("\n"));
}
