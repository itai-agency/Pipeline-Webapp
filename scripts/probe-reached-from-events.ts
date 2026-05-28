import "../server/config/env.js";
import { getKommoClientMap } from "../server/config/env.js";
import { KOMMO_CONTROL_REFERENCE } from "../server/config/kommoControlReference.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";

const SINCE = "2026-05-01";
const UNTIL = "2026-05-26";

async function main(): Promise<void> {
  const supabase = getSupabaseAdmin()!;
  console.log("reached* = leads creados en mayo con algún evento mql/sql/cita\n");

  for (const client of Object.values(getKommoClientMap())) {
    const html = KOMMO_CONTROL_REFERENCE.clients[client];
    if (!html) continue;

    const { data } = await supabase
      .from("kommo_lead_events")
      .select("kommo_lead_id, mql, sql, citas")
      .eq("client", client)
      .gte("lead_created_date", SINCE)
      .lte("lead_created_date", UNTIL)
      .not("kommo_event_id", "is", null);

    const byLead = new Map<number, { mql: number; sql: number; citas: number }>();
    for (const r of data ?? []) {
      const id = r.kommo_lead_id as number;
      const prev = byLead.get(id) ?? { mql: 0, sql: 0, citas: 0 };
      byLead.set(id, {
        mql: Math.max(prev.mql, (r.mql as number) ?? 0),
        sql: Math.max(prev.sql, (r.sql as number) ?? 0),
        citas: Math.max(prev.citas, (r.citas as number) ?? 0),
      });
    }

    let reachedMql = 0;
    let reachedSql = 0;
    let reachedCita = 0;
    for (const v of byLead.values()) {
      if (v.mql > 0) reachedMql += 1;
      if (v.sql > 0) reachedSql += 1;
      if (v.citas > 0) reachedCita += 1;
    }

    const ok =
      byLead.size === html.leads && reachedMql === html.reachedMql ? "✓" : "≠";
    console.log(
      `${client.padEnd(16)} leads ${String(byLead.size).padStart(4)} mql ${String(reachedMql).padStart(3)} | HTML ${html.leads} ${html.reachedMql} ${ok}`,
    );
  }
}

main().catch(console.error);
