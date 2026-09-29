// Temporary: classic Sidearm box score structure. Removed before merge.
import { parse } from "node-html-parser";
for (const url of ["https://fiusports.com/boxscore.aspx?id=14892&path=msoc", "https://gohatters.com/sports/mens-soccer/stats/2026"]) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; FAU men's soccer staff app)" } });
  const html = await res.text();
  console.log("==", url, res.status, res.url, html.length);
  if (url.includes("stats/2026")) {
    const a = html.match(/href=['"][^'"]*boxscore[^'"]*['"]/g);
    console.log("links", a?.slice(0, 5));
    continue;
  }
  const doc = parse(html);
  for (const t of doc.querySelectorAll("table")) {
    const text = t.outerHTML.replace(/\s+/g, " ");
    console.log("--TABLE", t.querySelector("caption")?.text.trim(), text.length);
    console.log(text.slice(0, 2500));
  }
}
