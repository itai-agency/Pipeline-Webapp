import { env, isKommoConfigured, isMetaConfigured } from "../config/env.js";
import { currentMonthRange } from "../lib/dateRanges.js";
import { syncKommoStatusChangeEvents } from "../services/kommoTimeline.service.js";
import { syncMetaSpend } from "../services/meta.service.js";
import { refreshAndBroadcast } from "../services/metrics.service.js";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
// Max time between snapshot rebuilds even when no new events arrive
const FORCE_REFRESH_MS = 30 * 60 * 1000;
let _lastRefreshAt = 0;

async function runScheduledSync(): Promise<void> {
  const range = currentMonthRange();
  try {
    if (isMetaConfigured()) {
      await syncMetaSpend(range);
    }
    let newEvents = 0;
    if (isKommoConfigured()) {
      const { processed, skipped } = await syncKommoStatusChangeEvents({
        since: range.since,
        until: range.until,
      });
      newEvents = processed;
      console.log(
        `[scheduler] Kommo timeline: ${processed} cambios etapa, ${skipped} omitidos (${range.since}→${range.until})`,
      );
    }
    const isStale = Date.now() - _lastRefreshAt > FORCE_REFRESH_MS;
    if (newEvents > 0 || isStale) {
      await refreshAndBroadcast(range, { hasNewEvents: newEvents > 0 });
      _lastRefreshAt = Date.now();
      console.log("[scheduler] Snapshot rebuilt", { newEvents, forced: isStale && newEvents === 0 });
    }
    console.log("[scheduler] Sync completed", range);
  } catch (err) {
    console.error("[scheduler] Sync failed:", err);
  }
}

export function startSyncScheduler(): void {
  if (env.NODE_ENV !== "production") return;
  if (!isMetaConfigured() && !isKommoConfigured()) return;

  void runScheduledSync();
  setInterval(() => {
    void runScheduledSync();
  }, SYNC_INTERVAL_MS);

  console.log("[scheduler] Started (interval 5m, métricas diarias desde eventos)");
}
