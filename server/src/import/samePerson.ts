import type { getDb } from "../db/connection.js";
import { normalizePlayerName } from "./nameNormalization.js";

/**
 * Works out whether two spellings of a name are the same person, for names
 * that differ between the GPS files and the fausports.com roster: shortened or
 * nicknamed first names ("Chris" / "Christopher", "DJ" / "Djibril", "Mike" /
 * "Michael"), part of a double-barrelled surname ("Herbert Amoah" /
 * "Herbert Kwakye-Amoah"), a middle name in one source only ("Michel Nana
 * Tentchou" / "Michel Tentchou"), and small typos ("Yan Ntumba Tiki").
 */

const NICKNAMES: string[][] = [
  ["robert", "rob", "robbie", "bob", "bobby", "bert"],
  ["william", "will", "bill", "billy", "liam"],
  ["michael", "mike", "mikey", "mick"],
  ["christopher", "chris", "kit"],
  ["alexander", "alex", "xander", "sasha"],
  ["nicholas", "nick", "nico", "nicky"],
  ["joshua", "josh"],
  ["matthew", "matt"],
  ["daniel", "dan", "danny"],
  ["jonathan", "jon", "jonny", "johnny"],
  ["samuel", "sam", "sammy"],
  ["benjamin", "ben", "benji"],
  ["anthony", "tony"],
  ["joseph", "joe", "joey"],
  ["james", "jim", "jimmy", "jamie"],
  ["richard", "rich", "rick", "ricky"],
  ["edward", "ed", "eddie", "ted"],
  ["thomas", "tom", "tommy"],
  ["zachary", "zach", "zack"],
  ["jacob", "jake"],
  ["andrew", "andy", "drew"],
  ["francesco", "frank", "franco", "cesco"],
  ["giuseppe", "joe", "pepe"],
  ["alejandro", "alex", "ale"],
  ["francisco", "paco", "cisco", "fran"],
  ["xavier", "xavi"],
  ["david", "dave", "davey"],
  ["gabriel", "gabe", "gabi"],
  ["maximilian", "max"],
  ["oluwatobi", "tobi"],
  ["emmanuel", "manny", "emma"],
  ["steven", "stephen", "steve"],
  ["patrick", "pat", "paddy"],
  ["timothy", "tim"],
  ["kenneth", "ken", "kenny"],
  ["lawrence", "larry"],
];

/** "Last, First" (as box scores print names) to "First Last". */
const firstLast = (name: string) => {
  const i = name.indexOf(",");
  return i === -1 ? name : `${name.slice(i + 1)} ${name.slice(0, i)}`;
};

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** One typo allowed in names of 5+ letters. */
const nearly = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && levenshtein(a, b) <= 1);

function sameFirstName(a: string, b: string): boolean {
  if (nearly(a, b)) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 2 && long.startsWith(short)) return true; // Chris / Christopher, DJ / Djibril
  if (short.length === 1 && long[0] === short) return true; // initial
  return NICKNAMES.some((group) => group.includes(a) && group.includes(b));
}

/**
 * Last names match: the same (or one typo), one is a longer form of the other
 * ("Roberts" / "Robertson"), or one is part of the other's double-barrelled or
 * middle-named surname ("Amoah" / "Kwakye-Amoah").
 */
function sameLastName(a: string[], b: string[]): boolean {
  const lastA = a[a.length - 1];
  const lastB = b[b.length - 1];
  if (nearly(lastA, lastB)) return true;
  const [short, long] = lastA.length <= lastB.length ? [lastA, lastB] : [lastB, lastA];
  if (short.length >= 4 && long.startsWith(short)) return true;
  return (lastA.length >= 3 && b.slice(1).includes(lastA)) || (lastB.length >= 3 && a.slice(1).includes(lastB));
}

/**
 * 3: first and last names both match (allowing the variations above).
 * 2: the whole name is a near-exact spelling (typo-level difference).
 * 1: only the last name matches.
 * 0: different people.
 */
export function samePersonScore(nameA: string, nameB: string): number {
  const a = normalizePlayerName(firstLast(nameA)).split(" ").filter(Boolean);
  const b = normalizePlayerName(firstLast(nameB)).split(" ").filter(Boolean);
  if (!a.length || !b.length) return 0;
  const last = a.length > 1 && b.length > 1 && sameLastName(a, b);
  if (last && sameFirstName(a[0], b[0])) return 3;
  const whole = [a.join(" "), b.join(" ")];
  const longest = Math.max(whole[0].length, whole[1].length);
  if (longest >= 8 && levenshtein(whole[0], whole[1]) / longest <= 0.12) return 2;
  return last ? 1 : 0;
}

export interface PersonCandidate {
  id: number;
  names: string[]; // every known spelling (canonical name, aliases, roster name)
}

/**
 * The single candidate who is the same person, or null when nobody matches or
 * it's a tie. A matching last name is enough on its own (a squad rarely has two
 * players with similar surnames): "Luca Rogers" is Mitchell Rogers when he's
 * the only Rogers. When several share a surname, the first name decides.
 */
export function findSamePerson(name: string, candidates: PersonCandidate[]): { id: number; score: number } | null {
  const scored = candidates
    .map((c) => ({ c, score: Math.max(0, ...c.names.map((n) => samePersonScore(name, n))) }))
    .filter((x) => x.score > 0);
  const best = Math.max(0, ...scored.map((x) => x.score));
  const top = scored.filter((x) => x.score === best);
  return top.length === 1 ? { id: top[0].c.id, score: best } : null;
}

/** Every player in the app with all their known spellings (canonical name, aliases, roster name). */
export function playerCandidates(db: ReturnType<typeof getDb>): PersonCandidate[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.canonical_name AS name FROM players p
       UNION ALL SELECT a.player_id, a.raw_alias FROM player_aliases a
       UNION ALL SELECT r.player_id, r.player_name FROM roster_players r WHERE r.player_id IS NOT NULL`,
    )
    .all() as { id: number; name: string }[];
  const byId = new Map<number, string[]>();
  for (const r of rows) byId.set(r.id, [...(byId.get(r.id) ?? []), r.name]);
  return [...byId].map(([id, names]) => ({ id, names }));
}
