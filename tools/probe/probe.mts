// Temporary: St. Thomas's roster/stats API (v5). Removed before merge.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const get = async (url: string) => {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json, text/plain, */*" }, signal: AbortSignal.timeout(25000) });
  return { status: res.status, text: await res.text(), type: res.headers.get("content-type") };
};
const html = (await get("https://tommiesports.com/sports/mens-soccer/roster")).text;
const scripts = [...new Set(html.match(/\/_nuxt\/[A-Za-z0-9_.-]+\.js/g) ?? [])];
console.log("scripts", scripts.length);
const found = new Set<string>();
for (const s of scripts.slice(0, 60)) {
  const js = (await get(`https://tommiesports.com${s}`)).text;
  for (const m of js.match(/["'`]\/?api\/v2\/[A-Za-z0-9_/${}.?=&-]{2,80}/g) ?? []) found.add(m);
}
console.log([...found].filter((x) => /roster|stat|player|sport/i.test(x)).sort().join("\n"));
for (const u of [
  "https://tommiesports.com/api/v2/Rosters/bySport/mens-soccer",
  "https://tommiesports.com/api/v2/Rosters/bySport/mens-soccer?season=2026",
  "https://tommiesports.com/api/v2/Stats/bySport/mens-soccer?year=2026",
]) {
  try { const r = await get(u); console.log("==", u, r.status, r.type, r.text.slice(0, 600).replace(/\s+/g, " ")); } catch (e) { console.log(u, "ERR", (e as Error).message); }
}
