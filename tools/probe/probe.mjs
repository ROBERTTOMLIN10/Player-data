// Temporary: looks for Top Drawer Soccer's previous polls. Removed before merge.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const strip = (s) => s.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const get = async (u) => { const r = await fetch(u, { headers: { "User-Agent": UA } }); return { status: r.status, url: r.url, t: await r.text() }; };
const r = await get("https://www.topdrawersoccer.com/college-soccer-national-rankings/men");
for (const m of r.t.matchAll(/<select[\s\S]*?<\/select>/g)) console.log("SELECT:", m[0].slice(0, 2500));
for (const m of r.t.matchAll(/<form[\s\S]{0,1500}?<\/form>/g)) console.log("FORM:", strip(m[0]).slice(0, 400), m[0].slice(0, 600));
console.log("LINKS:", [...new Set([...r.t.matchAll(/href="([^"]*(?:rank|week|poll)[^"]*)"/gi)].map((m) => m[1]))].join("\n  "));
for (const m of r.t.matchAll(/.{0,200}(week|Week|previous|Previous|prev).{0,200}/g)) console.log("CTX:", strip(m[0]).slice(0, 300));
const t0 = r.t.match(/<table[\s\S]*?<\/table>/); if (t0) console.log("TABLE HEAD:", t0[0].slice(0, 3000));
for (const u of ["https://www.topdrawersoccer.com/college-soccer-national-rankings/men?week=4", "https://www.topdrawersoccer.com/college-soccer-national-rankings/men/2026/4"]) { const x = await get(u); const tt = x.t.match(/<table[\s\S]*?<\/table>/); console.log("TRY", u, x.status, x.url, tt ? strip(tt[0]).slice(0, 300) : "no table"); }
