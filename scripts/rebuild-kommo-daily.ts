/**
 * Reconstruye dashboard_metrics_daily por DÍA desde kommo_lead_events.
 * Usar tras backfill o si sync:kommo-snapshot dejó todo en un solo día.
 *
 * Uso:
 *   npm run rebuild:kommo-daily
 *   KOMMO_REBUILD_SINCE=2026-05-01 KOMMO_REBUILD_UNTIL=2026-05-26 npm run rebuild:kommo-daily
 */
import { isSupabaseConfigured } from "../server/config/env.js";
import { yearToDateRange } from "../server/lib/dateRanges.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";
import { rebuildDailyMetricsFromEvents } from "../server/services/kommo.service.js";
import { mergeMetaSpendIntoDaily, refreshAndBroadcast } from "../server/services/metrics.service.js";

const year = Number(process.env.KOMMO_REBUILD_YEAR) || new Date().getFullYear();
const since = process.env.KOMMO_REBUILD_SINCE ?? yearToDateRange(year).since;
const until = process.env.KOMMO_REBUILD_UNTIL ?? yearToDateRange(year).until;

async function printSample(client: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { data } = await supabase
    .from("dashboard_metrics_daily")
    .select("metric_date, conversaciones, mql, sql")
    .eq("client", client)
    .gte("metric_date", since)
    .lte("metric_date", until)
    .order("metric_date", { ascending: true });
  const rows = (data ?? []).filter((r) => (r.conversaciones as number) > 0);
  console.log(`\n  ${client} — días con conversaciones>0: ${rows.length}`);
  for (const r of rows.slice(0, 8)) {
    console.log(
      `    ${r.metric_date}: conv=${r.conversaciones} mql=${r.mql} sql=${r.sql}`,
    );
  }
  if (rows.length > 8) console.log(`    … +${rows.length - 8} días más`);
}

async function main(): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error("Falta Supabase en .env.local");
    process.exit(1);
  }

  console.log(`=== Rebuild métricas diarias Kommo ===`);
  console.log(`Rango: ${since} → ${until}\n`);

  const upserted = await rebuildDailyMetricsFromEvents(since, until);
  await mergeMetaSpendIntoDaily(since, until);
  await refreshAndBroadcast({ since, until });

  console.log(`Filas día×cliente escritas desde eventos: ${upserted}`);
  await printSample("DOS HOGARES");
  console.log("\nListo. El dashboard debe mostrar datos por día en el filtro de fechas.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
