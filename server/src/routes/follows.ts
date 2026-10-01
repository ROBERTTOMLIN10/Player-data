import { Router } from "express";
import { z } from "zod";
import { ALERTS, listFollows, OUR_TEAM, personalUserId, saveFollow } from "../lib/follows.js";
import { removeSubscription, saveSubscription, vapidPublicKey } from "../lib/push.js";
import { teamsByName } from "../ncaa/store.js";
import { ncaaLogoUrl } from "../ncaa/client.js";

/** Favorite teams, their game alerts, and turning on phone notifications (coaches and players). */
export const followsRouter = Router();

function teamNames(): Map<string, string> {
  return new Map([...teamsByName().values()].map((t) => [t.seo, t.name]));
}

followsRouter.get("/", (req, res) => {
  const userId = personalUserId(req.user!);
  if (userId === null) return res.json({ ourTeam: OUR_TEAM, signedIn: false, follows: [], publicKey: vapidPublicKey() });
  const names = teamNames();
  res.json({
    ourTeam: OUR_TEAM,
    signedIn: true,
    publicKey: vapidPublicKey(),
    follows: listFollows(userId).map((f) => ({ ...f, name: names.get(f.seo) ?? f.seo, logo: ncaaLogoUrl(f.seo) })),
  });
});

const changeSchema = z.object({
  starred: z.boolean().optional(),
  alerts: z.object(Object.fromEntries(ALERTS.map((a) => [a, z.boolean().optional()])) as Record<(typeof ALERTS)[number], z.ZodOptional<z.ZodBoolean>>).partial().optional(),
});

followsRouter.put("/:seo", (req, res) => {
  const userId = personalUserId(req.user!);
  if (userId === null) return res.status(400).json({ error: "Sign in to save favorites." });
  const seo = req.params.seo;
  if (!/^[a-z0-9-]{2,60}$/.test(seo)) return res.status(400).json({ error: "Unknown team." });
  const parsed = changeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid change." });
  saveFollow(userId, seo, parsed.data);
  res.json({ ok: true });
});

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

followsRouter.post("/push/subscribe", (req, res) => {
  const userId = personalUserId(req.user!);
  if (userId === null) return res.status(400).json({ error: "Sign in to turn on notifications." });
  const parsed = subscriptionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid notification subscription." });
  saveSubscription(userId, parsed.data);
  res.json({ ok: true });
});

followsRouter.post("/push/unsubscribe", (req, res) => {
  const userId = personalUserId(req.user!);
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : null;
  if (userId === null || !endpoint) return res.status(400).json({ error: "endpoint required" });
  removeSubscription(userId, endpoint);
  res.json({ ok: true });
});
