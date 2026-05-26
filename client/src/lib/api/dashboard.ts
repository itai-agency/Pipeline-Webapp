import { fetchEventSource } from "@microsoft/fetch-event-source";
import type { DashboardSnapshotDto, SseMessageDto } from "@shared/types/dashboard";
import { getAuthHeaders } from "@/lib/api/authHeaders";
import { getApiBase } from "@/lib/api/config";

const API_BASE = getApiBase();

export class SessionExpiredError extends Error {
  constructor() {
    super("Sesión expirada. Vuelve a iniciar sesión.");
    this.name = "SessionExpiredError";
  }
}

export async function fetchDashboardSnapshot(): Promise<DashboardSnapshotDto> {
  const res = await fetch(`${API_BASE}/dashboard/snapshot`, {
    headers: await getAuthHeaders(),
  });
  if (res.status === 401) {
    throw new SessionExpiredError();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Snapshot failed (${res.status})`);
  }
  return res.json() as Promise<DashboardSnapshotDto>;
}

export type DashboardSseHandlers = {
  onConnected?: (snapshot: DashboardSnapshotDto) => void;
  onSnapshotRefreshed?: (snapshot: DashboardSnapshotDto) => void;
  onMetaUpdated?: (recordsProcessed: number) => void;
  onKommoUpdated?: (recordsProcessed: number) => void;
  onError?: (error: unknown) => void;
};

const SSE_EVENT_TYPES = new Set([
  "connected",
  "snapshot_refreshed",
  "meta_updated",
  "kommo_updated",
  "heartbeat",
  "message",
]);

function handleSsePayload(handlers: DashboardSseHandlers, eventType: string, rawData: string): void {
  if (eventType === "heartbeat" || !rawData) return;
  try {
    const data = JSON.parse(rawData) as SseMessageDto;
    if (data.type === "connected" || data.type === "snapshot_refreshed") {
      const snapshot = data.payload as DashboardSnapshotDto;
      if (data.type === "connected") handlers.onConnected?.(snapshot);
      else handlers.onSnapshotRefreshed?.(snapshot);
    }
    if (data.type === "meta_updated") {
      const payload = data.payload as { recordsProcessed: number };
      handlers.onMetaUpdated?.(payload.recordsProcessed);
    }
    if (data.type === "kommo_updated") {
      const payload = data.payload as { recordsProcessed: number };
      handlers.onKommoUpdated?.(payload.recordsProcessed);
    }
  } catch {
    /* ignore malformed SSE payloads */
  }
}

export function subscribeDashboardSse(handlers: DashboardSseHandlers): () => void {
  const abortController = new AbortController();
  let closed = false;

  void (async () => {
    try {
      await fetchEventSource(`${API_BASE}/realtime/dashboard`, {
        signal: abortController.signal,
        headers: await getAuthHeaders(),
        async onopen(response) {
          if (response.status === 401) {
            throw new SessionExpiredError();
          }
          if (!response.ok) {
            throw new Error(`SSE failed (${response.status})`);
          }
        },
        onmessage(ev) {
          const eventType = ev.event && SSE_EVENT_TYPES.has(ev.event) ? ev.event : "message";
          if (ev.data) handleSsePayload(handlers, eventType, ev.data);
        },
        onerror(err) {
          if (closed || abortController.signal.aborted) return;
          handlers.onError?.(err);
          throw err;
        },
      });
    } catch (err) {
      if (!closed && !abortController.signal.aborted) {
        handlers.onError?.(err);
      }
    }
  })();

  return () => {
    closed = true;
    abortController.abort();
  };
}
