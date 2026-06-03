/**
 * Prueba: Excel sum(MQL diario) ~= leads en etapa MQL+ hoy (snapshot cohorte)?
 */
import "../server/config/env.js";
import { getKommoClientMap } from "../server/config/env.js";
import { classifyKommoStageTier, tierReachedMql } from "../server/config/kommoStageMap.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const CUTOFF = "2026-05-26";
const excel = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../reports/excel_daily_by_client.json"), "utf8"),
) as Record<string, Array<{ fecha: string; mql: number }>>;

async function main() {
  const pipes = await kommoGet<{
    _embedded?: { pipelines?: Array<{ id: number; _embedded?: { statuses?: Array<{ id: number; name: string }> } }> };
  }>("/leads/pipelines");
  const statusName = new Map<string, string>();
  for (const p of pipes._embedded?.pipelines ?? []) {
    for (const s of p._embedded?.statuses ?? []) {
      statusName.set(`${p.id}:${s.id}`, s.name);
    }
  }

  console.log("Cliente          | Excel sum MQL | Snapshot MQL+ | Delta");
  for (const [pid, client] of Object.entries(getKommoClientMap())) {
    const rows = (excel[client] ?? []).filter((r) => r.fecha >= "2026-05-01" && r.fecha <= CUTOFF);
    const exSum = rows.reduce((s, r) => s + r.mql, 0);
    const from = Math.floor(new Date("2026-05-01T00:00:00").getTime() / 1000);
    const to = Math.floor(new Date(`${CUTOFF}T23:59:59`).getTime() / 1000);
    let snap = 0;
    let page = 1;
    while (true) {
      const data = await kommoGet<{ _embedded?: { leads?: Array<{ status_id?: number }> } }>("/leads", {
        params: { page, limit: 250, "filter[pipeline_id]": pid, "filter[created_at][from]": from, "filter[created_at][to]": to },
      });
      for (const l of data._embedded?.leads ?? []) {
        const n = statusName.get(`${pid}:${l.status_id}`) ?? "";
        const t = classifyKommoStageTier(n);
        if (t !== "firmado" && tierReachedMql(t)) snap += 1;
      }
      const len = data._embedded?.leads?.length ?? 0;
      if (len < 250) break;
      page += 1;
    }
    console.log(`${client.padEnd(16)} | ${String(exSum).padStart(13)} | ${String(snap).padStart(13)} | ${snap - exSum >= 0 ? "+" : ""}${snap - exSum}`);
  }
}

main().catch(console.error);
