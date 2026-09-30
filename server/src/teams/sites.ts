/**
 * Athletics websites checked by hand (NCAA.com team id → host). Every other
 * D1 team's site is found automatically (see discover.ts); entries here win.
 * 'sidearm' = the current Sidearm (Nuxt) sites like fausports.com;
 * 'sidearm-classic' = Sidearm's older server-rendered pages;
 * 'wmt' = WMT sites, read through WMT's stats feed (set by discovery only).
 */
export type TeamPlatform = "sidearm" | "sidearm-classic" | "wmt";

export const TEAM_SITES: Record<string, { host: string; platform: TeamPlatform }> = {
  "fla-atlantic": { host: "fausports.com", platform: "sidearm" },
  charlotte: { host: "charlotte49ers.com", platform: "sidearm" },
  fiu: { host: "fiusports.com", platform: "sidearm-classic" },
  memphis: { host: "gotigersgo.com", platform: "sidearm" },
  "missouri-st": { host: "missouristatebears.com", platform: "sidearm" },
  "south-fla": { host: "gousfbulls.com", platform: "sidearm" },
  temple: { host: "owlsports.com", platform: "sidearm" },
  tulsa: { host: "tulsahurricane.com", platform: "sidearm" },
  uab: { host: "uabsports.com", platform: "sidearm" },
  mercer: { host: "mercerbears.com", platform: "sidearm" },
  "north-carolina-st": { host: "gopack.com", platform: "sidearm" },
  "north-florida": { host: "unfospreys.com", platform: "sidearm" },
  "cleveland-st": { host: "csuvikings.com", platform: "sidearm-classic" },
  fgcu: { host: "fgcuathletics.com", platform: "sidearm-classic" },
  stetson: { host: "gohatters.com", platform: "sidearm-classic" },
  // NCAA.com lists an old or wrong address for these, or its lookup kept dropping.
  quinnipiac: { host: "gobobcats.com", platform: "sidearm" },
  louisville: { host: "gocards.com", platform: "sidearm" },
  syracuse: { host: "cuse.com", platform: "sidearm" },
  "wake-forest": { host: "godeacs.com", platform: "sidearm" },
  "ga-southern": { host: "gseagles.com", platform: "sidearm" },
  "george-washington": { host: "gwsports.com", platform: "sidearm" },
  "oral-roberts": { host: "oruathletics.com", platform: "sidearm-classic" },
  uiw: { host: "uiwcardinals.com", platform: "sidearm-classic" },
  "stony-brook": { host: "stonybrookathletics.com", platform: "sidearm-classic" },
  bradley: { host: "bradleybraves.com", platform: "sidearm-classic" },
  "george-mason": { host: "gomason.com", platform: "sidearm-classic" },
};
