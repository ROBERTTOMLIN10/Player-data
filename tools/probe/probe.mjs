// Temporary: checks NCAA.com standings pages. Removed before merge.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const strip = (s) => s.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
for (const u of ["https://www.ncaa.com/standings/soccer-men/d1", "https://www.ncaa.com/standings/soccer-men/d1/2024", "https://www.ncaa.com/standings/soccer-men/d1/2021", "https://www.ncaa.com/standings/soccer-men/d1/american"]) {
  const r = await fetch(u, { headers: { "User-Agent": UA } }); const t = await r.text();
  console.log(`\n######## ${u} -> ${r.status} ${r.url} len=${t.length}`);
  const ts = [...t.matchAll(/<table[\s\S]*?<\/table>/g)]; console.log("TABLES", ts.length);
  ts.slice(0, 2).forEach((m) => console.log("T:", strip(m[0]).slice(0, 700)));
  const i = t.indexOf("American"); if (i > 0) console.log("AMERICAN CONTEXT:", strip(t.slice(i - 1500, i + 3000)).slice(0, 1500));
  for (const m of t.matchAll(/<select[\s\S]*?<\/select>/g)) console.log("SELECT:", m[0].slice(0, 1200));
  console.log("LINKS:", [...new Set([...t.matchAll(/href="([^"]*standings[^"]*)"/g)].map((m) => m[1]))].slice(0, 30).join(" "));
}
