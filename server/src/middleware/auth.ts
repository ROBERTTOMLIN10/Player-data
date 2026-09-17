import type { NextFunction, Request, Response } from "express";

/**
 * Simple HTTP Basic Auth gate for the whole app. Intended for a small,
 * single-team deployment (not multi-user auth) — one shared username/password
 * pair set via env vars. If ADMIN_USER/ADMIN_PASSWORD aren't set (e.g. local
 * dev), auth is skipped entirely so `npm run dev` keeps working with no setup.
 */
export function basicAuth(req: Request, res: Response, next: NextFunction) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;

  if (!user || !pass) {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (header?.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
    const sepIndex = decoded.indexOf(":");
    const reqUser = decoded.slice(0, sepIndex);
    const reqPass = decoded.slice(sepIndex + 1);
    if (reqUser === user && reqPass === pass) {
      next();
      return;
    }
  }

  res.set("WWW-Authenticate", 'Basic realm="FAU Men\'s Soccer Performance"');
  res.status(401).send("Authentication required.");
}
