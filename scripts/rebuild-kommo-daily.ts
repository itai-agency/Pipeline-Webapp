/**
 * Reconstruye dashboard_metrics_daily por DÍA desde kommo_lead_events.
 *
 * Uso (PowerShell — variables en la MISMA línea que npm):
 *   $env:KOMMO_REBUILD_SINCE="2026-05-01"; $env:KOMMO_REBUILD_UNTIL="2026-05-26"; npm run rebuild:kommo-daily
 *
 * Uso (argumentos, recomendado en Windows):
 *   npm run rebuild:kommo-daily -- --since 2026-05-01 --until 2026-05-26
 */
import "../server/config/env.js";
import { getAllowedDashboardClients, isSupabaseConfigured } from "../server/config/env.js";
import { currentMonthRange, yearToDateRange } from "../server/lib/dateRanges.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";
import { hasMetricsSourceColumn } from "../server/lib/dashboardMetricsDb.js";
import { rebuildDailyMetricsFromEvents } from "../server/services/kommo.service.js";
import { mergeMetaSpendIntoDaily, refreshAndBroadcast } from "../server/services/metrics.service.js";

function parseArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

const year = Number(process.env.KOMMO_REBUILD_YEAR) || new Date().getFullYear();
const useFullYear = parseArg("--full-year") != null || process.env.KOMMO_REBUILD_FULL_YEAR === "1";
const defaultRange = useFullYear ? yearToDateRange(year) : currentMonthRange();
const since =
  parseArg("--since") ?? process.env.KOMMO_REBUILD_SINCE ?? defaultRange.since;
const until =
  parseArg("--until") ?? process.env.KOMMO_REBUILD_UNTIL ?? defaultRange.until;
function rangeDays(s: string, u: string): number {
  const start = new Date(`${s}T12:00:00`).getTime();
  const end = new Date(`${u}T12:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

const enrichApi =
  process.env.KOMMO_ENRICH_COHORT_API === "1"
    ? true
    : process.env.KOMMO_REBUILD_SKIP_API === "1"
      ? false
      : rangeDays(since, until) <= 35;

async function auditEventsInRange(): Promise<{
  min: string | null;
  max: string | null;
  days: number;
  rows: number;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { min: null, max: null, days: 0, rows: 0 };

  const clients = Array.from(getAllowedDashboardClients());
  const { data, error } = await supabase
    .from("kommo_lead_events")
    .select("event_date")
    .in("client", clients)
    .gte("event_date", since)
    .lte("event_date", until);

  if (error) throw new Error(error.message);

  const dates = new Set((data ?? []).map((r) => r.event_date as string));
  const sorted = [...dates].sort();
  return {
    min: sorted[0] ?? null,
    max: sorted.at(-1) ?? null,
    days: sorted.length,
    rows: data?.length ?? 0,
  };
}

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
  console.log(`\n  ${client} — días con conversaciones>0 en [${since}, ${until}]: ${rows.length}`);
  for (const r of rows) {
    console.log(`    ${r.metric_date}: conv=${r.conversaciones} mql=${r.mql} sql=${r.sql}`);
  }
}

async function main(): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error("Falta Supabase en .env.local");
    process.exit(1);
  }

  console.log("=== Rebuild métricas diarias Kommo ===");
  console.log(`Rango solicitado: ${since} → ${until}`);
  console.log(
    `Origen: ${parseArg("--since") ? "CLI --since/--until" : process.env.KOMMO_REBUILD_SINCE ? "env KOMMO_REBUILD_*" : useFullYear ? "default año (--full-year)" : "default mes en curso"}`,
  );
  console.log(`Enriquecimiento API Kommo (created_at): ${enrichApi ? "sí" : "no (solo BD)"}`);
  if (!(await hasMetricsSourceColumn())) {
    console.log(
      "\n⚠ Falta migración 004 (metrics_source). El rebuild funciona en modo legacy.",
    );
    console.log("  Ejecuta supabase/migrations/004_metrics_source.sql en Supabase para censo + timeline.\n");
  } else {
    console.log("");
  }

  const before = await auditEventsInRange();
  console.log("--- kommo_lead_events en ese rango (ANTES del rebuild) ---");
  console.log(`  Filas: ${before.rows}  |  Días con datos: ${before.days}`);
  if (before.min) {
    console.log(`  Fechas reales en BD: ${before.min} → ${before.max}`);
  } else {
    console.log("  Sin eventos en el rango.");
  }

  if (before.max && before.max < until) {
    console.log(
      `\n⚠ El rebuild NO trae leads de Kommo. Solo suma lo que ya está en kommo_lead_events.`,
    );
    console.log(
      `  Faltan eventos desde ${before.max} hasta ${until}. Ejecuta backfill primero:`,
    );
    console.log(`    npm run backfill:kommo-year`);
    console.log(
      `  o sync por mes: POST /api/kommo/sync con since/until y created_at.\n`,
    );
  }

  const upserted = await rebuildDailyMetricsFromEvents(since, until, {
    enrichCohortFromApi: enrichApi,
  });
  await mergeMetaSpendIntoDaily(since, until);
  await refreshAndBroadcast({ since, until }, { kommoMode: "meta_only" });

  console.log(`\nFilas día×cliente escritas desde eventos: ${upserted}`);
  await printSample("DOS HOGARES");

  const after = await auditEventsInRange();
  if (after.max && after.max < until) {
    console.log(
      `\nResultado: métricas solo pueden existir hasta ${after.max} hasta que importes más eventos.`,
    );
  } else {
    console.log("\nListo.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
