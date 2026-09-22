import type { NextFunction, Request, Response } from "express";
import { authConfigured, lookupSession, parseCookies, SESSION_COOKIE, type AuthUser } from "../lib/auth.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Resolves the session cookie (if any) to req.user. If no coach login is
 * configured via ADMIN_USER/ADMIN_PASSWORD (e.g. local dev / the Mac launcher),
 * visitors without a session are treated as a coach so `npm run dev` keeps
 * working with no setup. Players can still sign in to test their view.
 */
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  const user = token ? lookupSession(token) : null;
  if (user) {
    req.user = user;
  } else if (!authConfigured()) {
    req.user = { userId: null, role: "coach", email: "local", playerId: null, playerName: null };
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  next();
}

export function requireCoach(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  if (req.user.role !== "coach") {
    res.status(403).json({ error: "Coaches only." });
    return;
  }
  next();
}

export function requirePlayer(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  if (req.user.role !== "player" || req.user.playerId === null) {
    res.status(403).json({ error: "This page is for player accounts." });
    return;
  }
  next();
}
