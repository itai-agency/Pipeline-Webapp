import type { DashboardSnapshotDto, SseMessageDto } from "@shared/types/dashboard";
import { getApiBase } from "@/lib/api/config";

const API_BASE = getApiBase();

export async function fetchDashboardSnapshot(): Promise<DashboardSnapshotDto> {
  const res = await fetch(`${API_BASE}/dashboard/snapshot`);
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
  onError?: (error: Event) => void;
};

export function subscribeDashboardSse(handlers: DashboardSseHandlers): () => void {
  const source = new EventSource(`${API_BASE}/realtime/dashboard`);

  const handleMessage = (event: MessageEvent<string>) => {
    try {
      const data = JSON.parse(event.data) as SseMessageDto;
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
  };

  source.addEventListener("connected", handleMessage);
  source.addEventListener("snapshot_refreshed", handleMessage);
  source.addEventListener("meta_updated", handleMessage);
  source.addEventListener("kommo_updated", handleMessage);
  source.addEventListener("message", handleMessage);
  source.onerror = (err) => handlers.onError?.(err);

  return () => source.close();
}
