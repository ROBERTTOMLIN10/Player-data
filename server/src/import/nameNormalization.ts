/**
 * Collapses spelling/formatting variants of a player name (extra whitespace,
 * accents, punctuation, case) into a stable lookup key so "Jose Garcia",
 * "José  Garcia", and "jose garcia" all resolve to the same player.
 */
export function normalizePlayerName(rawName: string): string {
  return rawName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
