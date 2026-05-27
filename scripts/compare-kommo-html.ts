/**
 * Compara censo API vs HTML de referencia (index-1.html).
 */
import "../server/config/env.js";
import { getKommoClientMap } from "../server/config/env.js";
import {
  classifyKommoStageTier,
  emptySnapshotByTier,
  type KommoStageTier,
} from "../server/config/kommoStageMap.js";
import { kommoGet } from "../server/lib/kommoApi.js";

const HTML_REF: Record<
  string,
  { leads: number; reachedMql: number; reachedSql: number; reachedCita: number; stages: Record<string, number> }
> = {
  HOGARES: { leads: 187, reachedMql: 65, reachedSql: 34, reachedCita: 9, stages: { entrada: 29, mql: 24, sql: 3, cita: 3, rejected: 128 } },
  INQ: { leads: 402, reachedMql: 32, reachedSql: 11, reachedCita: 9, stages: { entrada: 41, mql: 2, sql: 2, cita: 7, rejected: 350 } },
  INSPIRA: { leads: 80, reachedMql: 9, reachedSql: 5, reachedCita: 2, stages: { entrada: 30, mql: 4, sql: 3, cita: 2, rejected: 41 } },
  "GRUPO ELIJO": { leads: 438, reachedMql: 7, reachedSql: 3, reachedCita: 2, stages: { entrada: 80, mql: 4, sql: 1, rejected: 353 } },
  "DOS HOGARES": { leads: 99, reachedMql: 4, reachedSql: 1, reachedCita: 0, stages: { entrada: 14, mql: 3, sql: 1, rejected: 81 } },
  "MANOS AL HOGAR": { leads: 287, reachedMql: 20, reachedSql: 8, reachedCita: 7, stages: { entrada: 87, mql: 12, sql: 1, cita: 4, rejected: 183 } },
};

type LeadRow = {
  id: number;
  pipeline_id?: number;
  status_id?: number;
  closed_at?: number | null;
};

async function fetchPipelineLeads(pipelineId: number): Promise<LeadRow[]> {
  const all: LeadRow[] = [];
  let page = 1;
  while (true) {
    const data = await kommoGet<{ _embedded?: { leads?: unknown[] } }>("/leads", {
      params: { page, limit: 250, "filter[pipeline_id]": pipelineId },
    });
    const raw = data._embedded?.leads ?? [];
    if (!raw.length) break;
    for (const item of raw) {
      const row = item as LeadRow;
      all.push(row);
    }
    if (raw.length < 250) break;
    page += 1;
  }
  return all;
}

async function main(): Promise<void> {
  type PipelinesResponse = {
    _embedded?: {
      pipelines?: Array<{
        id: number;
        _embedded?: { statuses?: Array<{ id: number; name: string }> };
      }>;
    };
  };
  const data = await kommoGet<PipelinesResponse>("/leads/pipelines");
  const pipelines = data._embedded?.pipelines ?? [];
  const statusName = new Map<string, string>();
  for (const p of pipelines) {
    for (const s of p._embedded?.statuses ?? []) {
      statusName.set(`${p.id}:${s.id}`, s.name);
      statusName.set(String(s.id), s.name);
    }
  }

  const clientMap = getKommoClientMap();
  console.log("Cliente          | API all | sin firmado | sin firm+closed | HTML leads | tier MQL sum | HTML MQL\n");

  for (const [pid, client] of Object.entries(clientMap)) {
    const leads = await fetchPipelineLeads(Number(pid));
    const ref = HTML_REF[client];
    if (!ref) continue;

    const count = (filter: (tier: KommoStageTier, closed: boolean) => boolean): {
      total: number;
      reachedMql: number;
      by: Record<KommoStageTier, number>;
    } => {
      const by: Record<KommoStageTier, number> = emptySnapshotByTier();
      for (const lead of leads) {
        const name =
          statusName.get(`${lead.pipeline_id ?? pid}:${lead.status_id}`) ??
          statusName.get(String(lead.status_id)) ??
          "?";
        const tier = classifyKommoStageTier(name);
        const closed = lead.closed_at != null && lead.closed_at > 0;
        if (!filter(tier, closed)) continue;
        by[tier] += 1;
      }
      const total = Object.values(by).reduce((a, b) => a + b, 0);
      const reachedMql = by.mql + by.sql + by.cita + by.ofertado;
      return { total, reachedMql, by };
    };

    const all = count(() => true, false);
    const noFirmado = count((t) => t !== "firmado", false);
    const activeOnly = count((t, closed) => t !== "firmado" && !closed, false);

    console.log(
      `${client.padEnd(16)} | ${String(all.total).padStart(7)} | ${String(noFirmado.total).padStart(11)} | ${String(activeOnly.total).padStart(15)} | ${String(ref.leads).padStart(10)} | ${String(noFirmado.reachedMql).padStart(12)} | ${ref.reachedMql}`,
    );
  }
}

main().catch(console.error);
