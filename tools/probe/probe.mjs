// Temporary: finds the data feed behind NCAA.com standings. Removed before merge.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const get = async (u) => { const r = await fetch(u, { headers: { "User-Agent": UA } }); return { status: r.status, t: await r.text() }; };
const { t } = await get("https://www.ncaa.com/standings/soccer-men/d1/2024/american");
const dec = decodeURIComponent(t.replace(/\\u0022/g, '"').replace(/\\\//g, "/"));
console.log("QUERY NAMES:", [...new Set([...dec.matchAll(/(?:meta=|"operationName":"|queryName":")?([A-Za-z_]*(?:Standing|standing)[A-Za-z_]*)/g)].map((m) => m[1]))].slice(0, 30));
for (const m of dec.matchAll(/.{0,200}sha256Hash.{0,120}/g)) console.log("HASH CTX:", m[0]);
for (const m of dec.matchAll(/.{0,300}(standings|Standings).{0,300}/g)) { if (/sdataprod|graphql|json|api|data-/.test(m[0])) console.log("CTX:", m[0].slice(0, 600)); }
console.log("SEASON SELECT:", [...t.matchAll(/<select[\s\S]*?<\/select>/g)].map((m) => m[0]).filter((s) => /20\d\d/.test(s)).map((s) => s.slice(0, 800)));
const scripts = [...t.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((s) => /standings|casablanca/i.test(s));
console.log("SCRIPTS:", scripts);
for (const s of scripts.slice(0, 4)) { const u = s.startsWith("http") ? s : "https://www.ncaa.com" + s; const r = await get(u); for (const m of r.t.matchAll(/.{0,300}(sdataprod|sha256|meta=|fetch\(|\.json).{0,300}/g)) console.log("JS", s, ":", m[0].slice(0, 600)); }
// Drupal settings JSON
const ds = t.match(/<script type="application\/json" data-drupal-selector="drupal-settings-json">([\s\S]*?)<\/script>/);
if (ds) { const j = ds[1]; console.log("DRUPAL SETTINGS (standings bits):", [...j.matchAll(/.{0,200}standing.{0,300}/gi)].map((m) => m[0]).slice(0, 8)); }
const i = t.indexOf("casablanca-standings"); console.log("MARKUP:", t.slice(i, i + 2500));
