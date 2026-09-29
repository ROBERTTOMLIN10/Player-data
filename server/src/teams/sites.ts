/**
 * Athletics websites for the teams whose full squads we read (NCAA.com team
 * id → host). First batch: the American Conference plus FAU's D1 opponents.
 * 'sidearm' = the current Sidearm (Nuxt) sites like fausports.com;
 * 'sidearm-classic' = Sidearm's older server-rendered pages.
 * UCF runs a different platform (WMT) and isn't read yet.
 */
export type TeamPlatform = "sidearm" | "sidearm-classic";

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
};
