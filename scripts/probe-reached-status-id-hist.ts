/**
 * reachedMql = activos (tier MQL+) + rechazados con status_id histórico en etapas MQL+ del pipeline.
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

function toUnixRange(since: string, until: string) {
  const from = Math.floor(new Date(`${since}T00:00:00`).getTime() / 1000);
  const to = Math.floor(new Date(`${until}T23:59:59`).getTime() / 1000);
  return { from, to };
}

type StatusInfo = { id: number; name: string; tier: KommoStageTier };

function buildPipelineStatuses(
  pipelineId: number,
  pipelines: Array<{ id: number; _embedded?: { statuses?: Array<{ id: number; name: string }> } }>,
): StatusInfo[] {
  const p = pipelines.find((x) => x.id === pipelineId);
  return (p?._embedded?.statuses ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    tier: classifyKommoStageTier(s.name),
  }));
}

function tierFromStatusId(statusId: number | null, statuses: StatusInfo[]): KommoStageTier {
  if (!statusId) return "entrada";
  const s = statuses.find((x) => x.id === statusId);
  return s?.tier ?? "entrada";
}

async function main() {
  const pipes = await kommoGet<{
    _embedded?: { pipelines?: Array<{ id: number; _embedded?: { statuses?: Array<{ id: number; name: string }> } }> };
  }>("/leads/pipelines");
  const pipelines = pipes._embedded?.pipelines ?? [];

  let exact = 0;
  console.log("reached* = activos tier+ + rechazados con status_id histórico en etapa MQL+\n");

  for (const [pid, client] of Object.entries(getKommoClientMap())) {
    const html = KOMMO_CONTROL_REFERENCE.clients[client]!;
    const pipelineId = Number(pid);
    const statuses = buildPipelineStatuses(pipelineId, pipelines);
    const mqlPlusIds = new Set(statuses.filter((s) => tierReachedMql(s.tier)).map((s) => s.id));

    const { from, to } = toUnixRange(MONTH_START, CUTOFF);
    const cohort: Array<{ id: number; tier: KommoStageTier }> = [];
    let page = 1;
    while (true) {
      const data = await kommoGet<{ _embedded?: { leads?: Array<{ id: number; status_id?: number }> } }>(
        "/leads",
        { params: { page, limit: 250, "filter[pipeline_id]": pid, "filter[created_at][from]": from, "filter[created_at][to]": to } },
      );
      const rows = data._embedded?.leads ?? [];
      for (const lead of rows) {
        const tier = tierFromStatusId(lead.status_id ?? null, statuses);
        if (tier === "firmado") continue;
        cohort.push({ id: lead.id, tier });
      }
      if (!rows.length || rows.length < 250) break;
      page += 1;
    }

    const rejectedIds = cohort.filter((c) => c.tier === "rejected").map((c) => c.id);
    const everMqlPlus = new Set<number>();
    const supabase = getSupabaseAdmin()!;
    const chunk = 400;
    for (let i = 0; i < rejectedIds.length; i += chunk) {
      const ids = rejectedIds.slice(i, i + chunk);
      const { data } = await supabase
        .from("kommo_lead_events")
        .select("kommo_lead_id, status_id")
        .eq("client", client)
        .in("kommo_lead_id", ids)
        .lte("event_date", CUTOFF)
        .not("kommo_event_id", "is", null);
      for (const r of data ?? []) {
        const sid = r.status_id as number | null;
        if (sid != null && mqlPlusIds.has(sid)) {
          everMqlPlus.add(r.kommo_lead_id as number);
        }
      }
    }

    let mql = 0;
    let sql = 0;
    let cita = 0;
    const sqlPlusIds = new Set(statuses.filter((s) => tierReachedSql(s.tier)).map((s) => s.id));
    const citaPlusIds = new Set(statuses.filter((s) => tierReachedCita(s.tier)).map((s) => s.id));
    const everSqlPlus = new Set<number>();
    const everCitaPlus = new Set<number>();

    for (let i = 0; i < rejectedIds.length; i += chunk) {
      const ids = rejectedIds.slice(i, i + chunk);
      const { data } = await supabase
        .from("kommo_lead_events")
        .select("kommo_lead_id, status_id")
        .eq("client", client)
        .in("kommo_lead_id", ids)
        .lte("event_date", CUTOFF)
        .not("kommo_event_id", "is", null);
      for (const r of data ?? []) {
        const id = r.kommo_lead_id as number;
        const sid = r.status_id as number | null;
        if (sid != null && sqlPlusIds.has(sid)) everSqlPlus.add(id);
        if (sid != null && citaPlusIds.has(sid)) everCitaPlus.add(id);
      }
    }

    for (const { id, tier } of cohort) {
      if (tier !== "rejected") {
        if (tierReachedMql(tier)) mql += 1;
        if (tierReachedSql(tier)) sql += 1;
        if (tierReachedCita(tier)) cita += 1;
      } else {
        if (everMqlPlus.has(id)) mql += 1;
        if (everSqlPlus.has(id)) sql += 1;
        if (everCitaPlus.has(id)) cita += 1;
      }
    }

    const ok =
      cohort.length === html.leads && mql === html.reachedMql && sql === html.reachedSql && cita === html.reachedCita;
    if (ok) exact += 1;
    const activeMql = cohort.filter((c) => c.tier !== "rejected" && tierReachedMql(c.tier)).length;
    console.log(
      `${client.padEnd(16)} leads=${cohort.length}/${html.leads}  active=${activeMql} rejHist=${everMqlPlus.size}  mql=${mql}/${html.reachedMql} sql=${sql}/${html.reachedSql} cita=${cita}/${html.reachedCita}  ${ok ? "✓✓✓" : ""}`,
    );
  }
  console.log(`\nExact: ${exact}/6`);
}

main().catch(console.error);
