/**
 * reached* = leads de cohorte con al menos una transición a status_id MQL+ (timeline).
 */
import "../server/config/env.js";
import { getKommoClientMap } from "../server/config/env.js";
import { KOMMO_CONTROL_REFERENCE } from "../server/config/kommoControlReference.js";
import {
  classifyKommoStageTier,
  tierReachedCita,
  tierReachedMql,
  tierReachedSql,
} from "../server/config/kommoStageMap.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";

const MONTH_START = "2026-05-01";
const CUTOFF = "2026-05-26";

async function main() {
  const pipes = await kommoGet<{
    _embedded?: { pipelines?: Array<{ id: number; _embedded?: { statuses?: Array<{ id: number; name: string }> } }> };
  }>("/leads/pipelines");
  const pipelines = pipes._embedded?.pipelines ?? [];

  let exact = 0;
  console.log("reached* = cohorte con ≥1 evento timeline en status_id MQL+/SQL+/Cita+\n");

  for (const [pid, client] of Object.entries(getKommoClientMap())) {
    const html = KOMMO_CONTROL_REFERENCE.clients[client]!;
    const pipelineId = Number(pid);
    const statuses = (pipelines.find((p) => p.id === pipelineId)?._embedded?.statuses ?? []).map((s) => ({
      id: s.id,
      tier: classifyKommoStageTier(s.name),
    }));
    const mqlIds = new Set(statuses.filter((s) => tierReachedMql(s.tier)).map((s) => s.id));
    const sqlIds = new Set(statuses.filter((s) => tierReachedSql(s.tier)).map((s) => s.id));
    const citaIds = new Set(statuses.filter((s) => tierReachedCita(s.tier)).map((s) => s.id));

    const from = Math.floor(new Date(`${MONTH_START}T00:00:00`).getTime() / 1000);
    const to = Math.floor(new Date(`${CUTOFF}T23:59:59`).getTime() / 1000);
    const cohortIds: number[] = [];
    let page = 1;
    while (true) {
      const data = await kommoGet<{ _embedded?: { leads?: Array<{ id: number; status_id?: number }> } }>(
        "/leads",
        { params: { page, limit: 250, "filter[pipeline_id]": pid, "filter[created_at][from]": from, "filter[created_at][to]": to } },
      );
      for (const l of data._embedded?.leads ?? []) {
        const tier = classifyKommoStageTier(statuses.find((s) => s.id === l.status_id)?.name ?? "");
        if (tier !== "firmado") cohortIds.push(l.id);
      }
      const rows = data._embedded?.leads ?? [];
      if (!rows.length || rows.length < 250) break;
      page += 1;
    }

    const reachedMql = new Set<number>();
    const reachedSql = new Set<number>();
    const reachedCita = new Set<number>();
    const supabase = getSupabaseAdmin()!;
    const chunk = 300;
    for (let i = 0; i < cohortIds.length; i += chunk) {
      const ids = cohortIds.slice(i, i + chunk);
      const { data } = await supabase
        .from("kommo_lead_events")
        .select("kommo_lead_id, status_id")
        .eq("client", client)
        .in("kommo_lead_id", ids)
        .lte("event_date", CUTOFF)
        .not("kommo_event_id", "is", null);
      for (const r of data ?? []) {
        const id = r.kommo_lead_id as number;
        const sid = r.status_id as number;
        if (mqlIds.has(sid)) reachedMql.add(id);
        if (sqlIds.has(sid)) reachedSql.add(id);
        if (citaIds.has(sid)) reachedCita.add(id);
      }
    }

    const mql = reachedMql.size;
    const sql = reachedSql.size;
    const cita = reachedCita.size;
    const ok =
      cohortIds.length === html.leads && mql === html.reachedMql && sql === html.reachedSql && cita === html.reachedCita;
    if (ok) exact += 1;
    console.log(
      `${client.padEnd(16)} leads=${cohortIds.length}/${html.leads}  mql=${mql}/${html.reachedMql}  sql=${sql}/${html.reachedSql}  cita=${cita}/${html.reachedCita}  ${ok ? "✓" : ""}`,
    );
  }
  console.log(`\nExact: ${exact}/6`);
}

main().catch(console.error);
