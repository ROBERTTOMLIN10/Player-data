// Temporary: explores ranking sources from a runner with open internet. Removed before merge.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const get = async (u) => { try { const r = await fetch(u, { headers: { "User-Agent": UA } }); const t = await r.text(); return { status: r.status, url: r.url, t }; } catch (e) { return { status: 0, t: String(e) }; } };
const strip = (s) => s.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
async function page(u, { links, tables = true, text = 0, grep } = {}) {
  const r = await get(u);
  console.log(`\n######## ${u} -> ${r.status} ${r.url ?? ""} len=${r.t.length}`);
  if (links) console.log("LINKS:", [...new Set([...r.t.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => links.test(h)))].slice(0, 80).join("\n  "));
  if (tables) { const ts = [...r.t.matchAll(/<table[\s\S]*?<\/table>/g)]; console.log("TABLES:", ts.length); ts.slice(0, 3).forEach((m, i) => console.log(`T${i}:`, strip(m[0]).slice(0, 900))); }
  if (grep) for (const m of r.t.matchAll(grep)) console.log("GREP:", m[0].slice(0, 300));
  if (text) console.log("TEXT:", strip(r.t).slice(0, text));
  return r;
}
await page("https://www.ncaa.com/rankings/soccer-men/d1", { links: /rankings\/soccer-men/, tables: false });
await page("https://www.ncaa.com/rankings/soccer-men/d1/united-soccer-coaches", { links: /rankings|archive|20\d\d/, grep: /<select[\s\S]{0,1500}?<\/select>/g });
await page("https://www.topdrawersoccer.com/college-soccer-rankings/men/", { links: /rank/i, grep: /<select[\s\S]{0,2000}?<\/select>/g, text: 1500 });
await page("https://www.collegesoccernews.com/", { links: /rank|poll|top-?30|top-?25/i, tables: false });
await page("https://unitedsoccercoaches.org/rankings/college-rankings/ncaa-division-i-men/", { links: /rank|archive|20\d\d/i, grep: /<select[\s\S]{0,2000}?<\/select>/g });
await page("https://www.socceramerica.com/", { links: /rank|poll/i, tables: false });
await page("https://www.espn.com/mens-college-soccer/rankings", { links: /rank|season|week/i });
for (const y of [2026, 2025, 2021]) {
  const r = await get(`https://en.wikipedia.org/w/api.php?action=parse&page=${y}_NCAA_Division_I_men%27s_soccer_rankings&prop=wikitext&format=json&formatversion=2`);
  const w = (() => { try { return JSON.parse(r.t).parse.wikitext; } catch { return r.t.slice(0, 500); } })();
  console.log(`\n######## wiki ${y} status=${r.status} len=${w.length}`);
  console.log([...w.matchAll(/^==+[^=].*?==+$/gm)].map((m) => m[0]).join(" | "));
  console.log(w.slice(0, 2500));
}
// Past-season scoreboard via NCAA's GraphQL
const hash = "4bcb5e6432fa9da365c0c19af01b1f9015cc7eb5c21e7af2dba308784a166df7";
for (const [y, md] of [[2025, "10/18"], [2023, "10/14"], [2021, "10/16"]]) {
  const u = `https://sdataprod.ncaa.com?meta=GetContests_web&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }))}&variables=${encodeURIComponent(JSON.stringify({ sportCode: "MSO", division: 1, seasonYear: y, contestDate: `${md}/${y}` }))}`;
  const r = await get(u); let n = "?"; try { const j = JSON.parse(r.t); n = j.data?.contests?.length + " contests; sample " + JSON.stringify(j.data?.contests?.[0]?.teams?.map((t) => [t.seoname, t.score, t.conferenceSeo])); } catch { n = r.t.slice(0, 200); }
  console.log(`\n######## scoreboard ${y} ${md}: ${r.status} ${n}`);
}
// NCAA past stats/rankings URL patterns
await page("https://www.ncaa.com/stats/soccer-men/d1/2024/team/30", { tables: true, links: /stats\/soccer-men\/d1\/\d{4}/ });
