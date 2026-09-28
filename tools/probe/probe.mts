import { fetchAndParseNuxtPage } from "../../server/src/import/nuxtPayload.js";
const root = (await fetchAndParseNuxtPage("https://fausports.com/sports/mens-soccer/roster")) as any;
console.log("top keys", Object.keys(root ?? {}));
console.log("pinia keys", Object.keys(root?.pinia ?? {}));
const seen = new Set<any>();
function walk(v: any, path: string, depth: number) {
  if (!v || typeof v !== "object" || seen.has(v) || depth > 9) return;
  seen.add(v);
  if (Array.isArray(v) && v.length > 5 && v[0] && typeof v[0] === "object" && ("position" in v[0] || "positionShort" in v[0] || "firstName" in v[0])) {
    console.log("ARRAY", path, v.length, "keys:", Object.keys(v[0]).join(","));
    for (const p of v) console.log("  ", JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k, x]) => typeof x !== "object" && /name|pos|jersey|number|class|year/i.test(k)))));
    return;
  }
  for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, depth + 1);
}
walk(root, "root", 0);
