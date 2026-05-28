/**
 * Muestra qué fechas existen en kommo_lead_events y dashboard_metrics_daily.
 */
import "../server/config/env.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";
import { isSupabaseConfigured } from "../server/config/env.js";

const client = process.argv[2] ?? "DOS HOGARES";

async function main(): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error("Sin Supabase");
    process.exit(1);
  }
  const supabase = getSupabaseAdmin()!;

  const { data: events, error: e1 } = await supabase
    .from("kommo_lead_events")
    .select("event_date")
    .eq("client", client)
    .order("event_date", { ascending: true });

  if (e1) {
    console.error(e1.message);
    process.exit(1);
  }

  const eventDates = [...new Set((events ?? []).map((r) => r.event_date as string))].sort();
  console.log(`\n${client} — kommo_lead_events`);
  console.log(`  Total filas: ${events?.length ?? 0}`);
  console.log(`  Días distintos: ${eventDates.length}`);
  if (eventDates.length) {
    console.log(`  Primera: ${eventDates[0]}  Última: ${eventDates.at(-1)}`);
    console.log(`  Fechas: ${eventDates.join(", ")}`);
  }

  const { data: metrics, error: e2 } = await supabase
    .from("dashboard_metrics_daily")
    .select("metric_date, conversaciones, mql")
    .eq("client", client)
    .gte("metric_date", "2026-05-01")
    .lte("metric_date", "2026-05-31")
    .order("metric_date", { ascending: true });

  if (e2) {
    console.error(e2.message);
    process.exit(1);
  }

  const withConv = (metrics ?? []).filter((r) => (r.conversaciones as number) > 0);
  console.log(`\n${client} — dashboard_metrics_daily (mayo 2026)`);
  console.log(`  Filas totales: ${metrics?.length ?? 0}`);
  console.log(`  Días con conversaciones>0: ${withConv.length}`);
  for (const r of withConv) {
    console.log(`    ${r.metric_date}: conv=${r.conversaciones} mql=${r.mql}`);
  }

  console.log(
    "\nSi eventos solo llegan hasta el 7, rebuild 01–26 NO inventa días 8–26: hay que backfill Kommo.",
  );
}

main();
