/**
 * reachedMql = activos tier+ + rechazados cuyo max tier ANTES del primer evento "rechazado" fue MQL+.
 */
import "../server/config/env.js";
import { getKommoClientMap } from "../server/config/env.js";
import { KOMMO_CONTROL_REFERENCE } from "../server/config/kommoControlReference.js";
import {
  classifyKommoStageTier,
  tierReachedCita,
  tierReachedMql,
  tierReachedSql,
  type KommoStageTier,
} from "../server/config/kommoStageMap.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";

const MONTH_START = "2026-05-01";
const CUTOFF = "2026-05-26";

const RANK: Record<KommoStageTier, number> = {
  rejected: -1, entrada: 0, mql: 1, sql: 2, cita: 3, ofertado: 4, firmado: 5,
};

async function main() {
  const pipes = await kommoGet<{
    _embedded?: { pipelines?: Array<{ id: number; _embedded?: { statuses?: Array<{ id: number; name: string }> } }> };
  }>("/leads/pipelines");
  const pipelines = pipes._embedded?.pipelines ?? [];

  let exact = 0;
  console.log("reached* = activos tier+ + rechazados con max tier pre-rechazo >= MQL\n");

  for (const [pid, client] of Object.entries(getKommoClientMap())) {
    const html = KOMMO_CONTROL_REFERENCE.clients[client]!;
    const pipelineId = Number(pid);
    const statusTier = new Map<number, KommoStageTier>();
    for (const s of pipelines.find((p) => p.id === pipelineId)?._embedded?.statuses ?? []) {
      statusTier.set(s.id, classifyKommoStageTier(s.name));
    }

    const from = Math.floor(new Date(`${MONTH_START}T00:00:00`).getTime() / 1000);
    const to = Math.floor(new Date(`${CUTOFF}T23:59:59`).getTime() / 1000);
    const cohort: Array<{ id: number; tier: KommoStageTier }> = [];
    let page = 1;
    while (true) {
      const data = await kommoGet<{ _embedded?: { leads?: Array<{ id: number; status_id?: number }> } }>(
        "/leads",
        { params: { page, limit: 250, "filter[pipeline_id]": pid, "filter[created_at][from]": from, "filter[created_at][to]": to } },
      );
      for (const l of data._embedded?.leads ?? []) {
        const tier = statusTier.get(l.status_id ?? 0) ?? "entrada";
        if (tier !== "firmado") cohort.push({ id: l.id, tier });
      }
      const rows = data._embedded?.leads ?? [];
      if (!rows.length || rows.length < 250) break;
      page += 1;
    }

    const rejectedIds = cohort.filter((c) => c.tier === "rejected").map((c) => c.id);
    const preRejectMax = new Map<number, number>();
    const supabase = getSupabaseAdmin()!;
    const chunk = 200;
    for (let i = 0; i < rejectedIds.length; i += chunk) {
      const ids = rejectedIds.slice(i, i + chunk);
      const { data } = await supabase
        .from("kommo_lead_events")
        .select("kommo_lead_id, status_id, event_date")
        .eq("client", client)
        .in("kommo_lead_id", ids)
        .lte("event_date", CUTOFF)
        .not("kommo_event_id", "is", null)
        .order("event_date", { ascending: true });
      const byLead = new Map<number, typeof data>();
      for (const r of data ?? []) {
        const id = r.kommo_lead_id as number;
        const list = byLead.get(id) ?? [];
        list.push(r);
        byLead.set(id, list);
      }
      for (const [id, events] of byLead) {
        let max = -2;
        for (const ev of events ?? []) {
          const tier = statusTier.get(ev.status_id as number) ?? "entrada";
          if (tier === "rejected") break;
          if (RANK[tier] > max) max = RANK[tier];
        }
        preRejectMax.set(id, max);
      }
    }

    let mql = 0;
    let sql = 0;
    let cita = 0;
    for (const { id, tier } of cohort) {
      if (tier !== "rejected") {
        if (tierReachedMql(tier)) mql += 1;
        if (tierReachedSql(tier)) sql += 1;
        if (tierReachedCita(tier)) cita += 1;
      } else {
        const max = preRejectMax.get(id) ?? -2;
        if (max >= RANK.mql) mql += 1;
        if (max >= RANK.sql) sql += 1;
        if (max >= RANK.cita) cita += 1;
      }
    }

    const ok =
      cohort.length === html.leads && mql === html.reachedMql && sql === html.reachedSql && cita === html.reachedCita;
    if (ok) exact += 1;
    const activeMql = cohort.filter((c) => c.tier !== "rejected" && tierReachedMql(c.tier)).length;
    const rejMql = mql - activeMql;
    console.log(
      `${client.padEnd(16)} leads=${cohort.length}/${html.leads}  active=${activeMql} preRej=${rejMql}  mql=${mql}/${html.reachedMql} sql=${sql}/${html.reachedSql} cita=${cita}/${html.reachedCita}  ${ok ? "✓" : ""}`,
    );
  }
  console.log(`\nExact: ${exact}/6`);
}

main().catch(console.error);
