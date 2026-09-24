// Temporary: explores ranking sources from a runner with open internet. Removed before merge.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const get = async (u) => { try { const r = await fetch(u, { headers: { "User-Agent": UA } }); const t = await r.text(); return { status: r.status, url: r.url, t }; } catch (e) { return { status: 0, t: String(e) }; } };
const strip = (s) => s.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
async function page(u, { links, tables = true, text = 0, grep, tlen = 900 } = {}) {
  const r = await get(u);
  console.log(`\n######## ${u} -> ${r.status} ${r.url ?? ""} len=${r.t.length}`);
  if (links) console.log("LINKS:", [...new Set([...r.t.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => links.test(h)))].slice(0, 80).join("\n  "));
  if (tables) { const ts = [...r.t.matchAll(/<table[\s\S]*?<\/table>/g)]; console.log("TABLES:", ts.length); ts.slice(0, 3).forEach((m, i) => console.log(`T${i}:`, strip(m[0]).slice(0, tlen))); }
  if (grep) for (const m of r.t.matchAll(grep)) console.log("GREP:", m[0].slice(0, 3000));
  if (text) console.log("TEXT:", strip(r.t).slice(0, text));
  return r;
}
await page("https://www.ncaa.com/rankings/soccer-men/d1/united-soccer-coaches", { tables: false, grep: /<select[\s\S]*?<\/select>/g });
await page("https://www.ncaa.com/rankings/soccer-men/d1/ncaa-mens-soccer-rpi", { tables: false, grep: /<select[\s\S]*?<\/select>|[^"]*archive[^"]*|Updated[^<]{0,80}/gi });
await page("https://www.topdrawersoccer.com/", { tables: false, links: /rank/i });
await page("https://www.topdrawersoccer.com/college-soccer/college-rankings/men/", { links: /rank/i, grep: /<select[\s\S]{0,3000}?<\/select>/g, tlen: 1500 });
const csn = await page("https://collegesoccernews.com/category/college-soccer-news/polls/csn-weekly-top-25-coaches-poll/", { tables: false, links: /top-25|poll/i });
await page("https://collegesoccernews.com/college-soccer-news-mens-soccer-week-5-top-25-poll-top-4-are-split-by-finest-of-margins/", { tlen: 1500 });
await page("https://collegesoccernews.com/polls/", { tlen: 1500, links: /poll|top/i });
const r = await get(`https://en.wikipedia.org/w/api.php?action=parse&page=2026_NCAA_Division_I_men%27s_soccer_rankings&prop=wikitext&format=json&formatversion=2`);
const w = JSON.parse(r.t).parse.wikitext;
const i = w.indexOf("== Top Drawer Soccer ==");
console.log("\n######## wiki TDS 2026\n" + w.slice(i, i + 5000));
const j = w.indexOf("Week2-1"); console.log("\n######## wiki USC wk2+\n" + w.slice(j - 200, j + 1500));
const k = w.lastIndexOf("}}", w.indexOf("== Top Drawer Soccer ==")); console.log("\n######## end USC\n" + w.slice(k - 3000, k + 10));
// Wiki 2023 USC final keys
const r3 = await get(`https://en.wikipedia.org/w/api.php?action=parse&page=2023_NCAA_Division_I_men%27s_soccer_rankings&prop=wikitext&format=json&formatversion=2`);
const w3 = JSON.parse(r3.t).parse?.wikitext ?? r3.t.slice(0, 300);
console.log("\n######## wiki 2023 sections", [...w3.matchAll(/^==+[^=].*?==+$/gm)].map((m) => m[0]).join(" | "));
const f = w3.indexOf("Week14-1"); console.log(w3.slice(f - 300, f + 1200));
