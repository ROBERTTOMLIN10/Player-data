import webpush from "web-push";
import { getDb } from "../db/connection.js";
import { getSetting, setSetting } from "./settings.js";

/**
 * Web push (phone notifications) for the morning check-in reminder.
 *
 * Push needs a VAPID key pair identifying this server to Apple/Google's push
 * services. Set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY to pin them; otherwise a
 * pair is generated once and kept in the database, so it works with no setup.
 * (Changing keys invalidates existing subscriptions, so keep the DB/disk.)
 */
let configured = false;

export function vapidPublicKey(): string {
  ensureConfigured();
  return process.env.VAPID_PUBLIC_KEY || getSetting("vapid_public_key")!;
}

function ensureConfigured() {
  if (configured) return;
  let publicKey = process.env.VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    publicKey = getSetting("vapid_public_key") ?? undefined;
    privateKey = getSetting("vapid_private_key") ?? undefined;
    if (!publicKey || !privateKey) {
      const keys = webpush.generateVAPIDKeys();
      publicKey = keys.publicKey;
      privateKey = keys.privateKey;
      setSetting("vapid_public_key", publicKey);
      setSetting("vapid_private_key", privateKey);
    }
  }
  // Push services require a contact for the sender; not shown to players.
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function saveSubscription(userId: number, sub: PushSubscriptionInput) {
  // Endpoint is unique per browser install; re-subscribing (or a different
  // player signing in on the same phone) takes the row over.
  getDb()
    .prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    )
    .run(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth);
}

export function removeSubscription(userId: number, endpoint: string) {
  getDb().prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").run(userId, endpoint);
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
}

/** Sends to every subscription for the given users. Returns how many deliveries succeeded. */
export async function sendToUsers(userIds: number[], message: PushMessage): Promise<{ sent: number; failed: number }> {
  if (userIds.length === 0) return { sent: 0, failed: 0 };
  ensureConfigured();
  const db = getDb();
  const subs = db
    .prepare(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${userIds.map(() => "?").join(",")})`)
    .all(...userIds) as { id: number; endpoint: string; p256dh: string; auth: string }[];

  let sent = 0;
  let failed = 0;
  const payload = JSON.stringify(message);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 60 * 60 * 3, // a reminder is useless after the morning
        });
        db.prepare("UPDATE push_subscriptions SET last_success_at = datetime('now') WHERE id = ?").run(s.id);
        sent += 1;
      } catch (err) {
        failed += 1;
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the player uninstalled, cleared data, or turned notifications off.
        if (status === 404 || status === 410) db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(s.id);
        else console.error(`[push] send failed (${status ?? "network"}): ${(err as Error).message}`);
      }
    }),
  );
  return { sent, failed };
}
