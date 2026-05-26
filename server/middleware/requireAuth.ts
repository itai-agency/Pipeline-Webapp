import type { NextFunction, Request, Response } from "express";
import { isAuthRequired } from "../config/env.js";
import { UnauthorizedError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/supabaseAuth.js";

function extractBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  const token = header.slice(7).trim();
  return token || undefined;
}

export async function requireAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!isAuthRequired()) {
    next();
    return;
  }

  const token = extractBearerToken(req);
  if (!token) {
    next(new UnauthorizedError("Authentication required"));
    return;
  }

  try {
    const user = await verifyAccessToken(token);
    req.authUser = user;
    next();
  } catch (err) {
    next(err instanceof UnauthorizedError ? err : new UnauthorizedError("Invalid session"));
  }
}
