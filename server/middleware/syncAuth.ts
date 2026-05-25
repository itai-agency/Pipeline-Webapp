import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { UnauthorizedError } from "../lib/errors.js";

export function syncAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const secret = env.SYNC_API_SECRET;
  if (!secret) {
    next();
    return;
  }
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.headers["x-sync-secret"];
  if (token !== secret) {
    next(new UnauthorizedError("Invalid sync secret"));
    return;
  }
  next();
}
