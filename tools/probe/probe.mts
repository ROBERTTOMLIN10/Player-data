import { fetchAndParseNuxtPage } from "../../server/src/import/nuxtPayload.js";
const root = (await fetchAndParseNuxtPage("https://fausports.com/sports/mens-soccer/roster")) as any;
const store = root.pinia.roster.roster;
const roster: any = Object.values(store).find((r: any) => r && Array.isArray(r.players));
console.log("roster keys", Object.keys(roster));
const p = roster.players.find((x: any) => x.lastName === "Koulai") ?? roster.players[0];
const trim = (v: any, d = 0): any => {
  if (v === null || typeof v !== "object") return typeof v === "string" && v.length > 300 ? v.slice(0, 300) + "…" : v;
  if (d > 2) return Array.isArray(v) ? `[${v.length}]` : "{…}";
  if (Array.isArray(v)) return v.slice(0, 3).map((x) => trim(x, d + 1));
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x, d + 1)]));
};
console.log(JSON.stringify(trim(p), null, 1));
for (const x of roster.players.slice(0, 5)) console.log(x.firstName, x.lastName, JSON.stringify(x.image)?.slice(0, 300), x.birthDate, x.hometown, x.heightFeet, x.heightInches, x.weight);
// A player bio page, to see if more lives there
const slug = p.slug ?? p.rosterPlayerId;
console.log("slug", p.slug, p.id, p.rosterPlayerId, p.url);
