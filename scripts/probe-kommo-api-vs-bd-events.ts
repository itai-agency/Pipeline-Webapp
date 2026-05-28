/**
 * Compara eventos BD vs API Kommo para cohorte mayo — DOS HOGARES primero.
 */
import "../server/config/env.js";
import { getKommoClientMap } from "../server/config/env.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";
import { classifyKommoStageTier, tierReachedMql } from "../server/config/kommoStageMap.js";

const MONTH_START = "2026-05-01";
const CUTOFF = "2026-05-26";

function toUnixRange(since: string, until: string) {
  const from = Math.floor(new Date(`${since}T00:00:00`).getTime() / 1000);
  const to = Math.floor(new Date(`${until}T23:59:59`).getTime() / 1000);
  return { from, to };
}

async function fetchCohortIds(pipelineId: number): Promise<number[]> {
  const { from, to } = toUnixRange(MONTH_START, CUTOFF);
  const ids: number[] = [];
  let page = 1;
  while (true) {
    const data = await kommoGet<{ _embedded?: { leads?: Array<{ id: number }> } }>("/leads", {
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
    ids.push(...rows.map((r) => r.id));
    if (rows.length < 250) break;
    page += 1;
  }
  return ids;
}

async function fetchKommoEvents(from: number, to: number) {
  const all: Array<{ id: string; entity_id: number; created_at: number; type: string }> = [];
  let page = 1;
  while (true) {
    const data = await kommoGet<{ _embedded?: { events?: typeof all } }>("/events", {
      params: {
        page,
        limit: 250,
        "filter[type]": "lead_status_changed",
        "filter[entity]": "lead",
        "filter[created_at][from]": from,
        "filter[created_at][to]": to,
      },
    });
    const rows = data._embedded?.events ?? [];
    if (!rows.length) break;
    all.push(...rows);
    if (rows.length < 250) break;
    page += 1;
  }
  return all;
}

async function main() {
  const client = "DOS HOGARES";
  const pipelineId = Number(
    Object.entries(getKommoClientMap()).find(([, c]) => c === client)?.[0] ?? 0,
  );
  const cohort = new Set(await fetchCohortIds(pipelineId));
  const { from, to } = toUnixRange(MONTH_START, CUTOFF);

  const apiEvents = await fetchKommoEvents(from, to);
  const apiForCohort = apiEvents.filter((e) => cohort.has(e.entity_id));

  const supabase = getSupabaseAdmin()!;
  const { data: dbEvents } = await supabase
    .from("kommo_lead_events")
    .select("kommo_event_id, kommo_lead_id, mql, stage_name, event_date")
    .eq("client", client)
    .gte("event_date", MONTH_START)
    .lte("event_date", CUTOFF)
    .not("kommo_event_id", "is", null);

  const dbForCohort = (dbEvents ?? []).filter((e) => cohort.has(e.kommo_lead_id as number));

  console.log(`${client} cohort=${cohort.size}`);
  console.log(`API events mayo (todos): ${apiEvents.length}, cohort: ${apiForCohort.length}`);
  console.log(`BD events mayo: ${dbEvents?.length ?? 0}, cohort: ${dbForCohort.length}`);

  const apiIds = new Set(apiForCohort.map((e) => e.id));
  const dbIds = new Set(dbForCohort.map((e) => e.kommo_event_id));
  let inDbNotApi = 0;
  let inApiNotDb = 0;
  for (const id of dbIds) if (!apiIds.has(id as string)) inDbNotApi += 1;
  for (const id of apiIds) if (!dbIds.has(id)) inApiNotDb += 1;
  console.log(`Solo BD: ${inDbNotApi} · Solo API: ${inApiNotDb}`);

  const byLeadMql = new Map<number, number>();
  for (const e of dbForCohort) {
    const id = e.kommo_lead_id as number;
    byLeadMql.set(id, Math.max(byLeadMql.get(id) ?? 0, (e.mql as number) ?? 0));
  }
  let reached = 0;
  for (const v of byLeadMql.values()) if (v > 0) reached += 1;
  console.log(`BD reachedMql (max mql flag): ${reached} · HTML=4`);
}

main().catch(console.error);
