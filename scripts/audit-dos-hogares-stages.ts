/**
 * Auditoría rápida: etapas y contadores guardados para DOS HOGARES.
 * Uso: npm run audit:dos-hogares
 */
import "../server/config/env.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";

async function main(): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error("Supabase no configurado");
    process.exit(1);
  }

  const { data, error } = await supabase
    .from("kommo_lead_events")
    .select("stage_name, status_id, conversations, mql, sql, citas, firmas")
    .eq("client", "DOS HOGARES");

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  console.log(`Total filas DOS HOGARES: ${rows.length}\n`);

  const byStage = new Map<string, { count: number; conv: number; mql: number; sql: number }>();
  for (const row of rows) {
    const key = `${row.status_id ?? "?"} · ${row.stage_name ?? "?"}`;
    const cur = byStage.get(key) ?? { count: 0, conv: 0, mql: 0, sql: 0 };
    cur.count += 1;
    cur.conv += (row.conversations as number) ?? 0;
    cur.mql += (row.mql as number) ?? 0;
    cur.sql += (row.sql as number) ?? 0;
    byStage.set(key, cur);
  }

  for (const [stage, agg] of Array.from(byStage.entries()).sort((a, b) => b[1].count - a[1].count)) {
    console.log(
      `${stage}: ${agg.count} leads | sum conv=${agg.conv} mql=${agg.mql} sql=${agg.sql}`,
    );
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.conv += (r.conversations as number) ?? 0;
      acc.mql += (r.mql as number) ?? 0;
      acc.sql += (r.sql as number) ?? 0;
      return acc;
    },
    { conv: 0, mql: 0, sql: 0 },
  );
  console.log(`\nTotales columnas: conv=${totals.conv} mql=${totals.mql} sql=${totals.sql}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
