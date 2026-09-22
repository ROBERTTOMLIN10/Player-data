import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/connection.js";
import { destroySessionsForUser, hashPassword } from "../lib/auth.js";
import { POSITION_SUBQUERY } from "./players.js";

/** Coach-only management of player and coach logins (mounted under /api/admin/accounts). */
export const accountsRouter = Router();

const MIN_PASSWORD = 6;
const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);
const password = z.string().min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters.`).max(200);

accountsRouter.get("/", (_req, res) => {
  const db = getDb();
  const players = db
    .prepare(
      `SELECT p.id AS player_id, p.canonical_name AS name, pos.position,
              u.id AS user_id, u.email, u.last_login_at
       FROM players p
       LEFT JOIN users u ON u.player_id = p.id
       ${POSITION_SUBQUERY}
       ORDER BY p.canonical_name ASC`,
    )
    .all();
  const coaches = db
    .prepare("SELECT id AS user_id, email, last_login_at FROM users WHERE role = 'coach' ORDER BY email")
    .all();
  res.json({ players, coaches, envCoach: process.env.ADMIN_USER ?? null });
});

const createSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("player"), email, password, playerId: z.number().int() }),
  z.object({ role: z.literal("coach"), email, password }),
]);

accountsRouter.post("/", (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid account details." });
  const input = parsed.data;
  const db = getDb();

  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(input.email)) {
    return res.status(409).json({ error: "That email already has a login." });
  }
  const playerId = input.role === "player" ? input.playerId : null;
  if (playerId !== null) {
    if (!db.prepare("SELECT 1 FROM players WHERE id = ?").get(playerId)) {
      return res.status(404).json({ error: "Player not found." });
    }
    if (db.prepare("SELECT 1 FROM users WHERE player_id = ?").get(playerId)) {
      return res.status(409).json({ error: "That player already has a login." });
    }
  }

  const { id } = db
    .prepare("INSERT INTO users (email, password_hash, role, player_id) VALUES (?, ?, ?, ?) RETURNING id")
    .get(input.email, hashPassword(input.password), input.role, playerId) as { id: number };
  res.status(201).json({ user_id: id });
});

const updateSchema = z.object({ email: email.optional(), password: password.optional() });

accountsRouter.patch("/:id", (req, res) => {
  const userId = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!Number.isInteger(userId) || !parsed.success) {
    return res.status(400).json({ error: parsed.success ? "invalid account id" : parsed.error.issues[0]?.message });
  }
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId)) return res.status(404).json({ error: "Account not found." });

  const { email: newEmail, password: newPassword } = parsed.data;
  if (newEmail) {
    const clash = db.prepare("SELECT id FROM users WHERE email = ? AND id <> ?").get(newEmail, userId);
    if (clash) return res.status(409).json({ error: "That email already has a login." });
    db.prepare("UPDATE users SET email = ? WHERE id = ?").run(newEmail, userId);
  }
  if (newPassword) {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), userId);
    // A reset signs the account out everywhere, so a lost phone stops working.
    destroySessionsForUser(userId);
  }
  res.json({ ok: true });
});

accountsRouter.delete("/:id", (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: "invalid account id" });
  if (req.user?.userId === userId) return res.status(400).json({ error: "You can't delete the login you're using." });
  const result = getDb().prepare("DELETE FROM users WHERE id = ?").run(userId);
  if (result.changes === 0) return res.status(404).json({ error: "Account not found." });
  res.json({ ok: true });
});
