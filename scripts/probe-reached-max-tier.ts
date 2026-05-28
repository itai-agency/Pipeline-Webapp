/**
 * reached* = máximo tier alcanzado en historial de eventos (por status, no flags acumulados).
 */
import "../server/config/env.js";
import { getKommoClientMap } from "../server/config/env.js";
import { KOMMO_CONTROL_REFERENCE } from "../server/config/kommoControlReference.js";
import {
  classifyKommoStageTier,
  type KommoStageTier,
} from "../server/config/kommoStageMap.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";

const MONTH_START = "2026-05-01";
const CUTOFF = "2026-05-26";

const TIER_RANK: Record<KommoStageTier, number> = {
  rejected: -1,
  entrada: 0,
  mql: 1,
  sql: 2,
  cita: 3,
  ofertado: 4,
  firmado: 5,
};

function toUnixRange(since: string, until: string) {
  const from = Math.floor(new Date(`${since}T00:00:00`).getTime() / 1000);
  const to = Math.floor(new Date(`${until}T23:59:59`).getTime() / 1000);
  return { from, to };
}

async function fetchCohort(pipelineId: number) {
  const { from, to } = toUnixRange(MONTH_START, CUTOFF);
  const all: Array<{ id: number; pipeline_id?: number; status_id?: number }> = [];
  let page = 1;
  while (true) {
    const data = await kommoGet<{ _embedded?: { leads?: typeof all } }>("/leads", {
      params: {
        page,
        limit: 250,
        "filter[pipeline_id]": pipelineId,
        "filter[created_at][from]": from,
        "filter[created_at][to]": to,
      },
    });
    const rows = data._embedded?.leads ?? [];
    if (!rows.length) break;
    all.push(...rows);
    if (rows.length < 250) break;
    page += 1;
  }
  return all;
}

function maxRankFromEvents(
  events: Array<{ stage_name: string | null; status_id: number | null; pipeline_id: number | null }>,
  statusName: Map<string, string>,
  pipelineId: number,
): number {
  let max = -2;
  for (const ev of events) {
    const name =
      ev.stage_name ||
      statusName.get(`${ev.pipeline_id ?? pipelineId}:${ev.status_id}`) ||
      statusName.get(String(ev.status_id)) ||
      "";
    const tier = classifyKommoStageTier(name);
    if (tier === "firmado") continue;
    const rank = TIER_RANK[tier];
    if (rank > max) max = rank;
  }
  return max;
}

async function main() {
  const supabase = getSupabaseAdmin()!;
  const pipes = await kommoGet<{
    _embedded?: { pipelines?: Array<{ id: number; _embedded?: { statuses?: Array<{ id: number; name: string }> } }> };
  }>("/leads/pipelines");
  const statusName = new Map<string, string>();
  for (const p of pipes._embedded?.pipelines ?? []) {
    for (const s of p._embedded?.statuses ?? []) {
      statusName.set(`${p.id}:${s.id}`, s.name);
      statusName.set(String(s.id), s.name);
    }
  }

  let exact = 0;
  console.log("max tier rank from event history (status_name) until cutoff\n");

  for (const [pid, client] of Object.entries(getKommoClientMap())) {
    const html = KOMMO_CONTROL_REFERENCE.clients[client]!;
    const raw = await fetchCohort(Number(pid));
    const cohortIds: number[] = [];
    for (const lead of raw) {
      const name =
        statusName.get(`${lead.pipeline_id ?? pid}:${lead.status_id}`) ??
        statusName.get(String(lead.status_id)) ??
        "";
      if (classifyKommoStageTier(name) === "firmado") continue;
      cohortIds.push(lead.id);
    }

    const eventsByLead = new Map<number, typeof eventRows>();
    type eventRows = Array<{
      stage_name: string | null;
      status_id: number | null;
      pipeline_id: number | null;
      event_date: string;
    }>;
    const chunk = 300;
    for (let i = 0; i < cohortIds.length; i += chunk) {
      const ids = cohortIds.slice(i, i + chunk);
      const { data } = await supabase
        .from("kommo_lead_events")
        .select("kommo_lead_id, stage_name, status_id, pipeline_id, event_date")
        .eq("client", client)
        .in("kommo_lead_id", ids)
        .lte("event_date", CUTOFF)
        .not("kommo_event_id", "is", null)
        .order("event_date", { ascending: true });
      for (const r of data ?? []) {
        const id = r.kommo_lead_id as number;
        const list = eventsByLead.get(id) ?? [];
        list.push(r as eventRows[0]);
        eventsByLead.set(id, list);
      }
    }

    let mql = 0;
    let sql = 0;
    let cita = 0;
    for (const id of cohortIds) {
      const max = maxRankFromEvents(eventsByLead.get(id) ?? [], statusName, Number(pid));
      if (max >= TIER_RANK.mql) mql += 1;
      if (max >= TIER_RANK.sql) sql += 1;
      if (max >= TIER_RANK.cita) cita += 1;
    }

    const ok =
      cohortIds.length === html.leads &&
      mql === html.reachedMql &&
      sql === html.reachedSql &&
      cita === html.reachedCita;
    if (ok) exact += 1;
    console.log(
      `${client.padEnd(16)} leads ${cohortIds.length}/${html.leads}  mql ${mql}/${html.reachedMql}  sql ${sql}/${html.reachedSql}  cita ${cita}/${html.reachedCita}  ${ok ? "✓" : ""}`,
    );
  }
  console.log(`\nExact: ${exact}/6`);
}

main().catch(console.error);
