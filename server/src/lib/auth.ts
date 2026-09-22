import crypto from "node:crypto";
import { getDb } from "../db/connection.js";

export type Role = "coach" | "player";

export interface AuthUser {
  userId: number | null; // null = env-var coach login (no users row)
  role: Role;
  email: string;
  playerId: number | null;
  playerName: string | null;
}

export const SESSION_COOKIE = "fau_sid";
// Players sign in once per device, so sessions are long-lived and slide forward
// on use; anyone who opens the app at least every few months never sees the
// login screen again.
export const SESSION_TTL_DAYS = 180;

export function authConfigured(): boolean {
  return Boolean(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function expiryFromNow(): string {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** Checks credentials against the env coach login first, then the users table. */
export function authenticate(email: string, password: string): AuthUser | null {
  const envUser = process.env.ADMIN_USER;
  const envPass = process.env.ADMIN_PASSWORD;
  if (envUser && envPass && safeEqual(email.toLowerCase(), envUser.toLowerCase()) && safeEqual(password, envPass)) {
    return { userId: null, role: "coach", email: envUser, playerId: null, playerName: null };
  }

  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.password_hash, u.role, u.player_id, p.canonical_name AS player_name
       FROM users u LEFT JOIN players p ON p.id = u.player_id
       WHERE u.email = ?`,
    )
    .get(email.trim()) as
    | { id: number; email: string; password_hash: string; role: Role; player_id: number | null; player_name: string | null }
    | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return null;

  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(row.id);
  return { userId: row.id, role: row.role, email: row.email, playerId: row.player_id, playerName: row.player_name };
}

export function createSession(user: AuthUser): string {
  const token = crypto.randomBytes(32).toString("base64url");
  getDb()
    .prepare("INSERT INTO auth_sessions (token_hash, user_id, role, expires_at) VALUES (?, ?, ?, ?)")
    .run(hashToken(token), user.userId, user.role, expiryFromNow());
  return token;
}

export function destroySession(token: string) {
  getDb().prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(hashToken(token));
}

export function destroySessionsForUser(userId: number) {
  getDb().prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(userId);
}

/** Resolves a session cookie to its user, sliding the expiry forward. */
export function lookupSession(token: string): AuthUser | null {
  const db = getDb();
  const tokenHash = hashToken(token);
  const session = db
    .prepare("SELECT user_id, role, expires_at FROM auth_sessions WHERE token_hash = ?")
    .get(tokenHash) as { user_id: number | null; role: Role; expires_at: string } | undefined;
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }

  let user: AuthUser | null;
  if (session.user_id === null) {
    // Env coach session: only valid while the env login is still configured.
    user = authConfigured()
      ? { userId: null, role: "coach", email: process.env.ADMIN_USER!, playerId: null, playerName: null }
      : null;
  } else {
    const row = db
      .prepare(
        `SELECT u.id, u.email, u.role, u.player_id, p.canonical_name AS player_name
         FROM users u LEFT JOIN players p ON p.id = u.player_id WHERE u.id = ?`,
      )
      .get(session.user_id) as
      | { id: number; email: string; role: Role; player_id: number | null; player_name: string | null }
      | undefined;
    user = row
      ? { userId: row.id, role: row.role, email: row.email, playerId: row.player_id, playerName: row.player_name }
      : null;
  }
  if (!user) {
    db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }

  db.prepare("UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ?").run(expiryFromNow(), tokenHash);
  return user;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

// Simple in-memory brute-force guard for the login endpoint.
const FAILED_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED = 10;
const failedAttempts = new Map<string, { count: number; firstAt: number }>();

export function loginLocked(key: string): boolean {
  const entry = failedAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > FAILED_WINDOW_MS) {
    failedAttempts.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILED;
}

export function recordLoginFailure(key: string) {
  const entry = failedAttempts.get(key);
  if (!entry || Date.now() - entry.firstAt > FAILED_WINDOW_MS) {
    failedAttempts.set(key, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

export function clearLoginFailures(key: string) {
  failedAttempts.delete(key);
}
