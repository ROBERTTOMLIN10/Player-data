import type { Request, Response } from "express";
import { getDb } from "../db/connection.js";
import { ncaaLogoUrl } from "../ncaa/client.js";
import { OUR_TEAM } from "./follows.js";

/**
 * Roster photos and opponent logos for the player report PDF. The browser can't
 * always copy a fausports.com image into a PDF (cross-site rules), so the server
 * fetches it. Only addresses the app already stores (a roster photo or a
 * schedule logo) are fetched, nothing a caller makes up.
 */
export async function sendReportImage(req: Request, res: Response) {
  const src = typeof req.query.src === "string" ? req.query.src : "";
  // NCAA.com team logos (FAU's and any team the app has a game for) are also allowed.
  const logoPrefix = ncaaLogoUrl("").slice(0, -".svg".length); // …/logos/schools/bgl/
  const maybeSeo = src.startsWith(logoPrefix) && src.endsWith(".svg") ? src.slice(logoPrefix.length, -".svg".length) : "";
  const seo = /^[a-z0-9-]+$/.test(maybeSeo) ? maybeSeo : null;
  const known =
    src === ncaaLogoUrl(OUR_TEAM) ||
    (!!seo && !!getDb().prepare("SELECT 1 FROM ncaa_games WHERE home_seo = @seo OR away_seo = @seo LIMIT 1").get({ seo })) ||
    getDb()
      .prepare(
        `SELECT 1 FROM roster_players WHERE photo_url = @src
       UNION SELECT 1 FROM schedule_games WHERE opponent_logo_url = @src LIMIT 1`,
      )
      .get({ src });
  if (!/^https?:\/\//.test(src) || !known) return res.status(404).json({ error: "Unknown image." });
  try {
    const r = await fetch(src, { signal: AbortSignal.timeout(8000) });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/")) return res.status(502).json({ error: "Image unavailable." });
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.status(502).json({ error: "Image unavailable." });
  }
}
