/**
 * Site-specific config for scraping FAU Men's Soccer data from Sidearm Sports
 * (fausports.com). Kept in one place so a URL slug or team name tweak next
 * season doesn't require touching the scraping logic itself.
 */
export const SIDEARM_BASE_URL = "https://fausports.com";
export const SCHEDULE_PATH = "/sports/mens-soccer/schedule";

/** Matches how FAU's own team name appears in Sidearm's boxscore JSON (varies: "Fla. Atlantic", "Florida Atlantic", "FAU"). */
export const FAU_TEAM_NAME_PATTERN = /\bfla\.?\s*atlantic\b|\bflorida atlantic\b|\bfau\b/i;
