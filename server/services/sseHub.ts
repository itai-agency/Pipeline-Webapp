import { EventEmitter } from "node:events";
import type { DashboardSnapshotDto, SseEventType } from "../../shared/types/dashboard.js";

type SsePayload = {
  type: SseEventType;
  payload?: DashboardSnapshotDto | { recordsProcessed: number };
  timestamp: string;
};

class SseHub extends EventEmitter {
  broadcast(type: SseEventType, payload?: SsePayload["payload"]): void {
    const message: SsePayload = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    this.emit("message", message);
  }
}

export const sseHub = new SseHub();
