import type { Request, Response, NextFunction } from "express";
import { nanoid } from "nanoid";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers["x-request-id"] as string) || nanoid(12);
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
