import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  authConfigured,
  authenticate,
  clearLoginFailures,
  createSession,
  destroySession,
  loginLocked,
  parseCookies,
  recordLoginFailure,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
} from "../lib/auth.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
});

function setSessionCookie(req: Request, res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

authRouter.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter your email and password." });
  const { email, password } = parsed.data;

  const lockKey = `${req.ip}|${email.toLowerCase()}`;
  if (loginLocked(lockKey)) {
    return res.status(429).json({ error: "Too many attempts. Wait 15 minutes and try again." });
  }

  const user = authenticate(email, password);
  if (!user) {
    recordLoginFailure(lockKey);
    return res.status(401).json({ error: "That email and password don't match." });
  }
  clearLoginFailures(lockKey);

  setSessionCookie(req, res, createSession(user));
  res.json({ role: user.role, email: user.email, playerId: user.playerId, playerName: user.playerName });
});

authRouter.post("/logout", (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) destroySession(token);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

// Returns 401 (not an error body the UI has to parse) when signed out, so the
// frontend can simply show the login screen.
authRouter.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Sign in required." });
  res.json({
    role: req.user.role,
    email: req.user.email,
    playerId: req.user.playerId,
    playerName: req.user.playerName,
    authRequired: authConfigured(),
  });
});
