/**
 * Por qué "no cuadra": suma de movimientos (timeline) vs censo HTML (kommoData).
 */
import "../server/config/env.js";
import { KOMMO_CONTROL_REFERENCE } from "../server/config/kommoControlReference.js";
import { hasMetricsSourceColumn } from "../server/lib/dashboardMetricsDb.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";
import { isSupabaseConfigured } from "../server/config/env.js";

const since = process.env.AUDIT_SINCE ?? "2026-05-01";
const until = process.env.AUDIT_UNTIL ?? "2026-05-26";

async function main(): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error("Sin Supabase");
    process.exit(1);
  }
  const supabase = getSupabaseAdmin()!;

  console.log(`=== Dashboard (suma ${since}→${until}) vs HTML corte ${until} ===\n`);
  console.log(
    "Cliente          | Σ conv (dashboard) | HTML leads | Σ MQL dash | HTML reachedMql | Nota",
  );
  console.log("-".repeat(95));

  for (const [client, html] of Object.entries(KOMMO_CONTROL_REFERENCE.clients).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const useSource = await hasMetricsSourceColumn();
    let q = supabase
      .from("dashboard_metrics_daily")
      .select("conversaciones, mql")
      .eq("client", client)
      .gte("metric_date", since)
      .lte("metric_date", until);
    if (useSource) {
      q = q.eq("metrics_source", "timeline");
    }
    const { data } = await q;

    const rows = data ?? [];
    const sumConv = rows.reduce((s, r) => s + ((r.conversaciones as number) ?? 0), 0);
    const sumMql = rows.reduce((s, r) => s + ((r.mql as number) ?? 0), 0);
    const note =
      sumConv > html.leads * 1.2
        ? "movimientos > censo (normal con timeline)"
        : sumConv === html.leads
          ? "cerca del censo"
          : "revisar datos";

    console.log(
      `${client.padEnd(16)} | ${String(sumConv).padStart(18)} | ${String(html.leads).padStart(10)} | ${String(sumMql).padStart(10)} | ${String(html.reachedMql).padStart(15)} | ${note}`,
    );
  }

  const { data: census } = await supabase
    .from("dashboard_metrics_daily")
    .select("client, conversaciones, mql")
    .eq("metrics_source", "census")
    .eq("metric_date", until);

  if (census?.length) {
    console.log(`\n--- Censo API en BD (${until}, metrics_source=census) ---`);
    for (const row of census.sort((a, b) => String(a.client).localeCompare(String(b.client)))) {
      const html = KOMMO_CONTROL_REFERENCE.clients[row.client as string];
      const h = html ? ` HTML leads=${html.leads}` : "";
      console.log(`  ${row.client}: conv=${row.conversaciones} mql=${row.mql}${h}`);
    }
  } else {
    console.log(
      `\nSin fila census en ${until}. Ejecuta: KOMMO_SNAPSHOT_DATE=${until} npm run sync:kommo-snapshot`,
    );
  }
}

main();
