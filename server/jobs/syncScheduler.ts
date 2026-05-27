import { env, isKommoConfigured, isMetaConfigured } from "../config/env.js";
import { currentMonthRange } from "../lib/dateRanges.js";
import { syncKommoSnapshotMetrics } from "../services/kommo.service.js";
import { syncMetaSpend } from "../services/meta.service.js";
import { refreshAndBroadcast } from "../services/metrics.service.js";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

async function runScheduledSync(): Promise<void> {
  const range = currentMonthRange();
  try {
    if (isMetaConfigured()) {
      await syncMetaSpend(range);
    }
    if (isKommoConfigured()) {
      const { processed, snapshots } = await syncKommoSnapshotMetrics({
        snapshotDate: range.until,
        monthStart: range.since,
        monthEnd: range.until,
      });
      const summary = snapshots
        .map((s) => `${s.client}=${s.leads}`)
        .sort()
        .join(", ");
      console.log(`[scheduler] Kommo snapshot (${processed} clientes): ${summary}`);
    }
    await refreshAndBroadcast(range, { kommoMode: "meta_only" });
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

  console.log("[scheduler] Started (interval 5m)");
}
