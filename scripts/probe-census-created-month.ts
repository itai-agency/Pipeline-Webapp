/**
 * Prueba: censo = leads creados en el mes del corte (sin firmado).
 */
import "../server/config/env.js";
import { getKommoClientMap } from "../server/config/env.js";
import { KOMMO_CONTROL_REFERENCE } from "../server/config/kommoControlReference.js";
import {
  classifyKommoStageTier,
  emptySnapshotByTier,
  type KommoStageTier,
} from "../server/config/kommoStageMap.js";
import { kommoGet } from "../server/lib/kommoApi.js";

const MONTH_START = "2026-05-01";
const MONTH_END = "2026-05-26";

function toUnixRange(since: string, until: string): { from: number; to: number } {
  const from = Math.floor(new Date(`${since}T00:00:00`).getTime() / 1000);
  const to = Math.floor(new Date(`${until}T23:59:59`).getTime() / 1000);
  return { from, to };
}

function tierReachedMql(tier: KommoStageTier): boolean {
  return tier === "mql" || tier === "sql" || tier === "cita" || tier === "ofertado" || tier === "firmado";
}

async function fetchCreatedInMonth(pipelineId: number, from: number, to: number) {
  const all: Array<{ pipeline_id?: number; status_id?: number; closed_at?: number | null }> = [];
  let page = 1;
  while (true) {
    const data = await kommoGet<{ _embedded?: { leads?: unknown[] } }>("/leads", {
      params: {
        page,
        limit: 250,
        "filter[pipeline_id]": pipelineId,
        "filter[created_at][from]": from,
        "filter[created_at][to]": to,
      },
    });
    const rows = (data._embedded?.leads ?? []) as typeof all;
    if (!rows.length) break;
    all.push(...rows);
    if (rows.length < 250) break;
    page += 1;
  }
  return all;
}

async function main(): Promise<void> {
  const { from, to } = toUnixRange(MONTH_START, MONTH_END);
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

  console.log(`Censo hipótesis: created_at ${MONTH_START} → ${MONTH_END}, excl. firmado\n`);
  console.log("Cliente          | API leads | API MQL | HTML leads | HTML MQL | Match?\n");

  for (const [pid, client] of Object.entries(getKommoClientMap())) {
    const html = KOMMO_CONTROL_REFERENCE.clients[client];
    if (!html) continue;

    const leads = await fetchCreatedInMonth(Number(pid), from, to);
    const by = emptySnapshotByTier();
    let total = 0;
    let reachedMql = 0;
    for (const lead of leads) {
      const name =
        statusName.get(`${lead.pipeline_id ?? pid}:${lead.status_id}`) ??
        statusName.get(String(lead.status_id)) ??
        "?";
      const tier = classifyKommoStageTier(name);
      if (tier === "firmado") continue;
      by[tier] += 1;
      total += 1;
      if (tierReachedMql(tier)) reachedMql += 1;
    }

    const ok = total === html.leads && reachedMql === html.reachedMql ? "✓" : "≠";
    console.log(
      `${client.padEnd(16)} | ${String(total).padStart(9)} | ${String(reachedMql).padStart(7)} | ${String(html.leads).padStart(10)} | ${String(html.reachedMql).padStart(8)} | ${ok}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
