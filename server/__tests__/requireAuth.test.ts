import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextFunction, Request, Response } from "express";

vi.mock("../config/env.js", () => ({
  isAuthRequired: vi.fn(),
}));

vi.mock("../lib/supabaseAuth.js", () => ({
  verifyAccessToken: vi.fn(),
}));

import { isAuthRequired } from "../config/env.js";
import { verifyAccessToken } from "../lib/supabaseAuth.js";
import { requireAuthMiddleware } from "../middleware/requireAuth.js";

function mockReq(authHeader?: string): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as Request;
}

function runMiddleware(req: Request): Promise<{ err: unknown; nextCalled: boolean }> {
  return new Promise((resolve) => {
    let nextCalled = false;
    const res = {} as Response;
    const next: NextFunction = (err?: unknown) => {
      nextCalled = true;
      resolve({ err, nextCalled });
    };
    void requireAuthMiddleware(req, res, next);
  });
}

describe("requireAuthMiddleware", () => {
  beforeEach(() => {
    vi.mocked(isAuthRequired).mockReset();
    vi.mocked(verifyAccessToken).mockReset();
  });

  it("allows request when auth is not required", async () => {
    vi.mocked(isAuthRequired).mockReturnValue(false);
    const result = await runMiddleware(mockReq());
    expect(result.err).toBeUndefined();
    expect(result.nextCalled).toBe(true);
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("returns unauthorized when auth required and no token", async () => {
    vi.mocked(isAuthRequired).mockReturnValue(true);
    const result = await runMiddleware(mockReq());
    expect(result.err).toBeDefined();
    expect((result.err as Error).message).toMatch(/Authentication required/i);
  });

  it("validates bearer token when auth required", async () => {
    vi.mocked(isAuthRequired).mockReturnValue(true);
    vi.mocked(verifyAccessToken).mockResolvedValue({ id: "user-1" } as never);
    const req = mockReq("Bearer jwt-token");
    const result = await runMiddleware(req);
    expect(result.err).toBeUndefined();
    expect(verifyAccessToken).toHaveBeenCalledWith("jwt-token");
    expect(req.authUser).toEqual({ id: "user-1" });
  });
});
