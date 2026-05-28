/**
 * Hipótesis Gregorio: reachedMql = activos en MQL+ hoy + rechazados que alguna vez estuvieron en MQL+.
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

async function loadEventTiers(client: string, leadIds: number[], statusName: Map<string, string>) {
  const supabase = getSupabaseAdmin()!;
  const everMql = new Map<number, boolean>();
  const everSql = new Map<number, boolean>();
  const everCita = new Map<number, boolean>();
  const chunk = 400;
  for (let i = 0; i < leadIds.length; i += chunk) {
    const ids = leadIds.slice(i, i + chunk);
    const { data } = await supabase
      .from("kommo_lead_events")
      .select("kommo_lead_id, status_id, pipeline_id, stage_name, mql, sql, citas, event_date")
      .eq("client", client)
      .in("kommo_lead_id", ids)
      .lte("event_date", CUTOFF)
      .not("kommo_event_id", "is", null);
    for (const r of data ?? []) {
      const id = r.kommo_lead_id as number;
      const name =
        (r.stage_name as string) ||
        statusName.get(`${r.pipeline_id}:${r.status_id}`) ||
        statusName.get(String(r.status_id)) ||
        "";
      const tier = classifyKommoStageTier(name);
      everMql.set(id, (everMql.get(id) ?? false) || tierReachedMql(tier) || (r.mql as number) > 0);
      everSql.set(id, (everSql.get(id) ?? false) || tierReachedSql(tier) || (r.sql as number) > 0);
      everCita.set(id, (everCita.get(id) ?? false) || tierReachedCita(tier) || (r.citas as number) > 0);
    }
  }
  return { everMql, everSql, everCita };
}

function countGregorio(
  cohort: Array<{ id: number; tier: KommoStageTier }>,
  ever: { everMql: Map<number, boolean>; everSql: Map<number, boolean>; everCita: Map<number, boolean> },
) {
  let mql = 0;
  let sql = 0;
  let cita = 0;
  for (const { id, tier } of cohort) {
    const reachedM =
      tier !== "rejected" ? tierReachedMql(tier) : (ever.everMql.get(id) ?? false);
    const reachedS =
      tier !== "rejected" ? tierReachedSql(tier) : (ever.everSql.get(id) ?? false);
    const reachedC =
      tier !== "rejected" ? tierReachedCita(tier) : (ever.everCita.get(id) ?? false);
    if (reachedM) mql += 1;
    if (reachedS) sql += 1;
    if (reachedC) cita += 1;
  }
  return { mql, sql, cita };
}

async function main() {
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
  console.log("Gregorio: activos=tier actual · rechazados=historial eventos hasta corte\n");

  for (const [pid, client] of Object.entries(getKommoClientMap())) {
    const html = KOMMO_CONTROL_REFERENCE.clients[client]!;
    const raw = await fetchCohort(Number(pid));
    const cohort: Array<{ id: number; tier: KommoStageTier }> = [];
    for (const lead of raw) {
      const name =
        statusName.get(`${lead.pipeline_id ?? pid}:${lead.status_id}`) ??
        statusName.get(String(lead.status_id)) ??
        "";
      const tier = classifyKommoStageTier(name);
      if (tier === "firmado") continue;
      cohort.push({ id: lead.id, tier });
    }
    const ever = await loadEventTiers(client, cohort.map((c) => c.id), statusName);
    const r = countGregorio(cohort, ever);
    const ok =
      cohort.length === html.leads &&
      r.mql === html.reachedMql &&
      r.sql === html.reachedSql &&
      r.cita === html.reachedCita;
    if (ok) exact += 1;
    console.log(
      `${client.padEnd(16)} leads ${String(cohort.length).padStart(3)}/${String(html.leads).padStart(3)}  mql ${String(r.mql).padStart(3)}/${String(html.reachedMql).padStart(3)}  sql ${String(r.sql).padStart(3)}/${String(html.reachedSql).padStart(3)}  cita ${String(r.cita).padStart(3)}/${String(html.reachedCita).padStart(3)}  ${ok ? "✓✓✓" : ""}`,
    );
  }
  console.log(`\nMatch exacto total: ${exact}/6`);
}

main().catch(console.error);
