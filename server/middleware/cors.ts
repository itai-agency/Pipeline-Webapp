import type { NextFunction, Request, Response } from "express";
import { env, getCorsAllowedOrigins } from "../config/env.js";

function isOriginAllowed(origin: string, allowed: ReturnType<typeof getCorsAllowedOrigins>): boolean {
  if (allowed.exact.has(origin)) return true;
  if (allowed.vercelPreviews && /^https:\/\/[\w-]+\.vercel\.app$/.test(origin)) return true;
  if (env.NODE_ENV !== "production" && allowed.devLocal.test(origin)) return true;
  return false;
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  const allowed = getCorsAllowedOrigins();

  if (origin && isOriginAllowed(origin, allowed)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Sync-Secret, x-sync-secret",
  );

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}
