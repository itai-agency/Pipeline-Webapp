/** Compara distribución byTier API vs HTML kommoData por cliente. */
import "../server/config/env.js";
import { getKommoClientMap } from "../server/config/env.js";
import {
  classifyKommoStageTier,
  type KommoStageTier,
} from "../server/config/kommoStageMap.js";
import { kommoGet } from "../server/lib/kommoApi.js";

const MONTH_START = "2026-05-01";
const CUTOFF = "2026-05-26";

const HTML_STAGES: Record<string, Partial<Record<KommoStageTier, number>>> = {
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

  for (const [pid, client] of Object.entries(getKommoClientMap())) {
    const html = HTML_STAGES[client]!;
    const { from, to } = toUnixRange(MONTH_START, CUTOFF);
    const byTier: Record<KommoStageTier, number> = {
      rejected: 0, entrada: 0, mql: 0, sql: 0, cita: 0, ofertado: 0, firmado: 0,
    };
    let page = 1;
    while (true) {
      const data = await kommoGet<{ _embedded?: { leads?: Array<{ id: number; pipeline_id?: number; status_id?: number }> } }>(
        "/leads",
        { params: { page, limit: 250, "filter[pipeline_id]": pid, "filter[created_at][from]": from, "filter[created_at][to]": to } },
      );
      const rows = data._embedded?.leads ?? [];
      for (const lead of rows) {
        const name =
          statusName.get(`${lead.pipeline_id ?? pid}:${lead.status_id}`) ??
          statusName.get(String(lead.status_id)) ?? "?";
        const tier = classifyKommoStageTier(name);
        if (tier === "firmado") continue;
        byTier[tier] += 1;
      }
      if (!rows.length || rows.length < 250) break;
      page += 1;
    }
    const total = Object.values(byTier).reduce((a, b) => a + b, 0);
    const activeMql = byTier.mql + byTier.sql + byTier.cita + byTier.ofertado;
    const htmlActiveMql =
      (html.mql ?? 0) + (html.sql ?? 0) + (html.cita ?? 0) + (html.ofertado ?? 0);
    console.log(`\n── ${client} (total ${total}) ──`);
    for (const t of ["entrada", "mql", "sql", "cita", "rejected"] as KommoStageTier[]) {
      const api = byTier[t];
      const h = html[t] ?? 0;
      const mark = api === h ? "✓" : `Δ${api - h}`;
      console.log(`  ${t.padEnd(10)} API=${String(api).padStart(3)}  HTML=${String(h).padStart(3)}  ${mark}`);
    }
    console.log(`  activeMql sum: API=${activeMql}  HTML=${htmlActiveMql}`);
  }
}

main().catch(console.error);
