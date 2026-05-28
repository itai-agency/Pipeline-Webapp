/**
 * Prueba: reachedMql = activos (mql+sql+cita+ofertado) + rechazados con historial MQL+.
 * Historial solo por classifyKommoStageTier(status_name), sin flags mql acumulados.
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

const HTML_STAGES: Record<string, Record<string, number>> = {
  HOGARES: { entrada: 29, mql: 24, sql: 3, cita: 3, rejected: 128 },
  INQ: { entrada: 41, mql: 2, sql: 2, cita: 7, rejected: 350 },
  INSPIRA: { entrada: 30, mql: 4, sql: 3, cita: 2, rejected: 41 },
  "GRUPO ELIJO": { entrada: 80, mql: 4, sql: 1, cita: 2, rejected: 353 },
  "DOS HOGARES": { entrada: 14, mql: 3, sql: 1, rejected: 81 },
  "MANOS AL HOGAR": { entrada: 87, mql: 12, sql: 1, cita: 4, rejected: 183 },
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

function stageSumReached(byTier: Record<KommoStageTier, number>) {
  return {
    mql: byTier.mql + byTier.sql + byTier.cita + byTier.ofertado,
    sql: byTier.sql + byTier.cita + byTier.ofertado,
    cita: byTier.cita + byTier.ofertado,
  };
}

async function maxTierFromEvents(
  client: string,
  leadIds: number[],
  statusName: Map<string, string>,
  pipelineId: number,
): Promise<Map<number, KommoStageTier>> {
  const supabase = getSupabaseAdmin()!;
  const maxTier = new Map<number, KommoStageTier>();
  const rank: Record<KommoStageTier, number> = {
    rejected: -1,
    entrada: 0,
    mql: 1,
    sql: 2,
    cita: 3,
    ofertado: 4,
    firmado: 5,
  };
  const chunk = 400;
  for (let i = 0; i < leadIds.length; i += chunk) {
    const ids = leadIds.slice(i, i + chunk);
    const { data } = await supabase
      .from("kommo_lead_events")
      .select("kommo_lead_id, stage_name, status_id, pipeline_id")
      .eq("client", client)
      .in("kommo_lead_id", ids)
      .lte("event_date", CUTOFF)
      .not("kommo_event_id", "is", null);
    for (const r of data ?? []) {
      const id = r.kommo_lead_id as number;
      const name =
        (r.stage_name as string) ||
        statusName.get(`${r.pipeline_id ?? pipelineId}:${r.status_id}`) ||
        statusName.get(String(r.status_id)) ||
        "";
      const tier = classifyKommoStageTier(name);
      if (tier === "firmado") continue;
      const prev = maxTier.get(id) ?? "entrada";
      if (rank[tier] > rank[prev]) maxTier.set(id, tier);
    }
  }
  return maxTier;
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
  console.log("Fórmula: activos (suma etapas) + rechazados con max tier histórico >= MQL\n");
  console.log(
    "Cliente          | leads | activeMql | rejHist | totalMql | HTML | htmlStageSum | match",
  );

  for (const [pid, client] of Object.entries(getKommoClientMap())) {
    const html = KOMMO_CONTROL_REFERENCE.clients[client]!;
    const htmlStages = HTML_STAGES[client]!;
    const htmlStageSum =
      htmlStages.mql + htmlStages.sql + (htmlStages.cita ?? 0) + (htmlStages.ofertado ?? 0);

    const raw = await fetchCohort(Number(pid));
    const byTier: Record<KommoStageTier, number> = {
      rejected: 0,
      entrada: 0,
      mql: 0,
      sql: 0,
      cita: 0,
      ofertado: 0,
      firmado: 0,
    };
    const cohort: Array<{ id: number; tier: KommoStageTier }> = [];
    for (const lead of raw) {
      const name =
        statusName.get(`${lead.pipeline_id ?? pid}:${lead.status_id}`) ??
        statusName.get(String(lead.status_id)) ??
        "";
      const tier = classifyKommoStageTier(name);
      if (tier === "firmado") continue;
      byTier[tier] += 1;
      cohort.push({ id: lead.id, tier });
    }

    const active = stageSumReached(byTier);
    const rejectedIds = cohort.filter((c) => c.tier === "rejected").map((c) => c.id);
    const hist = await maxTierFromEvents(client, rejectedIds, statusName, Number(pid));

    let rejMql = 0;
    let rejSql = 0;
    let rejCita = 0;
    for (const id of rejectedIds) {
      const t = hist.get(id) ?? "entrada";
      if (tierReachedMql(t)) rejMql += 1;
      if (tierReachedSql(t)) rejSql += 1;
      if (tierReachedCita(t)) rejCita += 1;
    }

    const totalMql = active.mql + rejMql;
    const totalSql = active.sql + rejSql;
    const totalCita = active.cita + rejCita;

    const ok =
      cohort.length === html.leads &&
      totalMql === html.reachedMql &&
      totalSql === html.reachedSql &&
      totalCita === html.reachedCita;
    if (ok) exact += 1;

    console.log(
      `${client.padEnd(16)} | ${String(cohort.length).padStart(5)} | ${String(active.mql).padStart(9)} | ${String(rejMql).padStart(7)} | ${String(totalMql).padStart(8)} | ${String(html.reachedMql).padStart(4)} | ${String(htmlStageSum).padStart(12)} | ${ok ? "✓" : `Δ${totalMql - html.reachedMql}`}`,
    );
  }
  console.log(`\nMatch exacto mql+sql+cita: ${exact}/6`);
}

main().catch(console.error);
