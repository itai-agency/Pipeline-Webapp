/**
 * Salud del backfill timeline: eventos vs métricas diarias (mayo 2026).
 */
import "../server/config/env.js";
import { getAllowedDashboardClients } from "../server/config/env.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";

const since = process.env.AUDIT_SINCE ?? "2026-05-01";
const until = process.env.AUDIT_UNTIL ?? "2026-05-26";

async function main(): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error("Sin Supabase");
    process.exit(1);
  }

  const clients = Array.from(getAllowedDashboardClients());

  console.log(`=== Timeline health ${since} → ${until} ===\n`);

  for (const client of clients.sort()) {
    const { data: events } = await supabase
      .from("kommo_lead_events")
      .select("event_date, conversations, mql, sql, citas, firmas, kommo_event_id, stage_name")
      .eq("client", client)
      .gte("event_date", since)
      .lte("event_date", until);

    const ev = events ?? [];
    const withKommoId = ev.filter((r) => r.kommo_event_id != null).length;
    const sumEv = ev.reduce(
      (a, r) => ({
        conv: a.conv + ((r.conversations as number) ?? 0),
        mql: a.mql + ((r.mql as number) ?? 0),
        sql: a.sql + ((r.sql as number) ?? 0),
        citas: a.citas + ((r.citas as number) ?? 0),
      }),
      { conv: 0, mql: 0, sql: 0, citas: 0 },
    );

    const eventDays = new Set(ev.map((r) => r.event_date as string)).size;

    const { data: metrics } = await supabase
      .from("dashboard_metrics_daily")
      .select("metric_date, conversaciones, mql, sql, citas")
      .eq("client", client)
      .gte("metric_date", since)
      .lte("metric_date", until);

    const met = metrics ?? [];
    const sumMet = met.reduce(
      (a, r) => ({
        conv: a.conv + ((r.conversaciones as number) ?? 0),
        mql: a.mql + ((r.mql as number) ?? 0),
        sql: a.sql + ((r.sql as number) ?? 0),
        citas: a.citas + ((r.citas as number) ?? 0),
      }),
      { conv: 0, mql: 0, sql: 0, citas: 0 },
    );
    const metDays = met.filter((r) => (r.conversaciones as number) > 0).length;

    const deltaConv = sumMet.conv - sumEv.conv;
    const flag = deltaConv === 0 ? "✓" : "≠";

    console.log(`${client}:`);
    console.log(
      `  eventos: ${ev.length} filas (${withKommoId} con kommo_event_id), ${eventDays} días | Σ conv/mql/sql/citas = ${sumEv.conv}/${sumEv.mql}/${sumEv.sql}/${sumEv.citas}`,
    );
    console.log(
      `  métricas: ${met.length} filas, ${metDays} días con conv>0 | Σ = ${sumMet.conv}/${sumMet.mql}/${sumMet.sql}/${sumMet.citas}`,
    );
    console.log(`  ${flag} Δ conv (métricas − eventos) = ${deltaConv >= 0 ? "+" : ""}${deltaConv}\n`);
  }

  const { count: legacy } = await supabase
    .from("kommo_lead_events")
    .select("id", { count: "exact", head: true })
    .is("kommo_event_id", null)
    .gte("event_date", since)
    .lte("event_date", until);

  console.log(`Filas legacy (sin kommo_event_id) en rango: ${legacy ?? 0}`);
  console.log(
    "\nNota: timeline suma MOVIMIENTOS (un lead puede sumar varias veces). HTML kommoData = censo al corte, no suma de movimientos.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
