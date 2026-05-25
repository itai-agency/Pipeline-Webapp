import { Router, type Response } from "express";
import type { SseMessageDto } from "../../shared/types/dashboard.js";
import { getDashboardSnapshot } from "../services/metrics.service.js";
import { sseHub } from "../services/sseHub.js";

const HEARTBEAT_MS = 25_000;

function writeSse(res: Response, event: string, data: SseMessageDto): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export const realtimeRouter = Router();

realtimeRouter.get("/dashboard", async (req, res, next) => {
  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const snapshot = await getDashboardSnapshot();
    writeSse(res, "connected", { type: "connected", payload: snapshot, timestamp: new Date().toISOString() });

    const onMessage = (message: SseMessageDto) => {
      writeSse(res, message.type, message);
    };

    sseHub.on("message", onMessage);

    const heartbeat = setInterval(() => {
      writeSse(res, "heartbeat", { type: "heartbeat", timestamp: new Date().toISOString() });
    }, HEARTBEAT_MS);

    req.on("close", () => {
      clearInterval(heartbeat);
      sseHub.off("message", onMessage);
      res.end();
    });
  } catch (err) {
    next(err);
  }
});
