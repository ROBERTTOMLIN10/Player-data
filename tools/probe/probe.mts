// Temporary: how to read the remaining D1 teams' sites (v2). Removed before merge.
import { parseNuxtPayload } from "../../server/src/import/nuxtPayload.js";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const get = async (url: string) => {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/json" }, signal: AbortSignal.timeout(20000) });
  return { status: res.status, url: res.url, text: await res.text(), type: res.headers.get("content-type") };
};
const cut = (v: unknown, n = 1500) => JSON.stringify(v)?.slice(0, n);
const section = async (name: string, fn: () => Promise<void>) => {
  console.log(`\n######## ${name}`);
  try { await fn(); } catch (e) { console.log("ERR", (e as Error).message, (e as any).cause?.code ?? ""); }
};

// 1. WMT roster (UCF): players list entry.
await section("wmt roster ucf", async () => {
  const r = await get("https://ucfknights.com/sports/mens-soccer/roster");
  const root = parseNuxtPayload(r.text) as any;
  const data = root.data ?? {};
  const key = Object.keys(data).find((k) => /players-list/.test(k))!;
  const list = data[key];
  console.log("key", key, "type", Array.isArray(list) ? "array" : typeof list, Object.keys(list ?? {}).slice(0, 10));
  const players = Array.isArray(list) ? list : list?.data ?? list?.players;
  console.log("count", players?.length);
  console.log("first", cut(players?.[0], 3000));
  const sv = Object.entries(data).find(([k]) => k.startsWith("sport-view-"))?.[1] as any;
  console.log("wmt", sv?.default_roster?.wmt_stats2_team_id, sv?.default_roster?.wmt_stats2_iframe_url, "schedule", sv?.schedule_id);
  console.log("sport-view keys", Object.keys(sv ?? {}).join(" "));
});

// 2. wmt.games stats page and likely APIs.
await section("wmt.games", async () => {
  for (const url of ["https://wmt.games/ucfknights/stats/season/623151", "https://api.wmt.games/api/statistics/teams/623151/players", "https://api.wmt.games/api/statistics/teams/623151"]) {
    const r = await get(url);
    console.log("==", url, r.status, r.type, r.text.length);
    console.log(r.text.slice(0, 1500).replace(/\s+/g, " "));
    const apis = [...new Set(r.text.match(/https?:\/\/[a-z0-9.-]+\/(api|v\d)[^"'\s<>]{0,80}/g) ?? [])].slice(0, 15);
    console.log("apis", apis);
    const scripts = [...new Set(r.text.match(/src="[^"]+\.js"/g) ?? [])].slice(0, 6);
    console.log("scripts", scripts);
    if (r.text.includes("__NUXT_DATA__")) {
      const root = parseNuxtPayload(r.text) as any;
      console.log("nuxt data keys", Object.keys(root.data ?? {}).slice(0, 20), "pinia", Object.keys(root.pinia ?? {}));
      for (const [k, v] of Object.entries(root.data ?? {}).slice(0, 5)) console.log("  ", k, cut(v, 2500));
    }
    const nd = r.text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nd) console.log("NEXT_DATA", nd[1].slice(0, 4000));
  }
});

// 3. WMT schedule (box scores?).
await section("wmt schedule ucf", async () => {
  const r = await get("https://ucfknights.com/sports/mens-soccer/schedule");
  const root = parseNuxtPayload(r.text) as any;
  const data = root.data ?? {};
  console.log("keys", Object.keys(data).filter((k) => !k.startsWith("i-")).slice(0, 20));
  for (const [k, v] of Object.entries(data)) if (/schedule|event/i.test(k)) console.log("  ", k, cut(v, 2500));
  console.log("boxscore links", [...new Set(r.text.match(/https?:\/\/[^"'\s<>]*(boxscore|box-score)[^"'\s<>]*/gi) ?? [])].slice(0, 5));
});

// 4. St. Thomas (new Sidearm variant).
await section("st-thomas roster", async () => {
  const r = await get("https://tommiesports.com/sports/mens-soccer/roster");
  const root = parseNuxtPayload(r.text) as any;
  const ro = root.pinia?.roster;
  console.log("roster store keys", Object.keys(ro ?? {}));
  for (const [k, v] of Object.entries(ro ?? {})) console.log("  ", k, cut(v, 2500));
  const s = await get("https://tommiesports.com/sports/mens-soccer/stats/2026");
  const sr = parseNuxtPayload(s.text) as any;
  console.log("stats pinia", Object.keys(sr.pinia ?? {}));
  for (const [k, v] of Object.entries(sr.pinia ?? {})) if (/stat/i.test(k)) console.log("  ", k, cut(v, 2500));
});

// 5. Classic sidearm table layout (Bradley).
await section("bradley roster", async () => {
  const r = await get("https://bradleybraves.com/sports/mens-soccer/roster");
  const i = r.text.indexOf("sidearm-roster-player");
  console.log(r.text.slice(i - 300, i + 2500).replace(/\s+/g, " "));
  const t = r.text.indexOf("<table");
  console.log("TABLE", r.text.slice(t, t + 2500).replace(/\s+/g, " "));
});

// 6. The rest: paths and hosts.
await section("others", async () => {
  const tries: [string, string][] = [
    ["kentucky", "https://ukathletics.com/sports/msoc/roster"], ["kentucky", "https://ukathletics.com/sports/mens-soccer/roster/"],
    ["south-carolina", "https://gamecocksonline.com/sports/msoc/roster"], ["south-carolina", "https://gamecocksonline.com/sports/mens-soccer/roster/"],
    ["notre-dame", "https://fightingirish.com/sports/msoc/roster"], ["notre-dame", "https://fightingirish.com/sports/msoc/roster/"],
    ["stony-brook", "https://goseawolves.org/sports/mens-soccer/roster"], ["quinnipiac", "https://quinnipiacbobcats.com/sports/mens-soccer/roster/"],
    ["quinnipiac", "https://gobobcats.com/sports/mens-soccer/roster"],
    ["oral-roberts", "https://www.orugoldeneagles.com/sports/msoc/roster"], ["oral-roberts", "https://oruathletics.com/sports/mens-soccer/roster"],
    ["central-conn-st", "https://ccsubluedevils.com/sports/mens-soccer/roster"],
    ["louisville", "https://gocards.com/sports/mens-soccer/roster"], ["syracuse", "https://cuse.com/sports/mens-soccer/roster"],
    ["wake-forest", "https://godeacs.com/sports/mens-soccer/roster"], ["colgate", "https://gocolgateraiders.com/sports/mens-soccer/roster"],
    ["ga-southern", "https://gseagles.com/sports/mens-soccer/roster"], ["george-washington", "https://gwsports.com/sports/mens-soccer/roster"],
    ["uiw", "https://uiwcardinals.com/sports/mens-soccer/roster"],
  ];
  for (const [seo, url] of tries) {
    try {
      const r = await get(url);
      const marks = ["__NUXT_DATA__", "oas-", "sidearm-roster-player", "s-person-card", "roster-card-item", "wmt.games", "players-list", "prestosports", "wp-content"].filter((m) => r.text.includes(m));
      console.log(seo, url, r.status, r.url, r.text.length, marks.join(","), r.text.length < 800 ? r.text.replace(/\s+/g, " ") : "");
    } catch (e) { console.log(seo, url, "ERR", (e as Error).message, (e as any).cause?.code ?? ""); }
  }
});
