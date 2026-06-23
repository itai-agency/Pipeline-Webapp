import { env, isKommoConfigured, isMetaConfigured } from "../config/env.js";
import { currentMonthRange } from "../lib/dateRanges.js";
import { syncKommoStatusChangeEvents } from "../services/kommoTimeline.service.js";
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
      const { processed, skipped } = await syncKommoStatusChangeEvents({
        since: range.since,
        until: range.until,
      });
      console.log(
        `[scheduler] Kommo timeline: ${processed} cambios etapa, ${skipped} omitidos (${range.since}→${range.until})`,
      );
    }
    // Sin rango → refreshAndBroadcast usa defaultRebuildRange (4 meses rolling)
    // para capturar firmas tardías en cohortes anteriores.
    // El sync de Kommo arriba solo trae eventos del mes en curso (nuevos);
    // el rebuild cubre los 4 meses donde los leads pueden estar activos.
    await refreshAndBroadcast();
    console.log("[scheduler] Sync completed (rebuild 4m rolling)");
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
