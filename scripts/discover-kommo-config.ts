/**
 * Lista pipelines, etapas y mapas sugeridos para .env.local
 * Uso: npm run kommo:discover
 */
import "../server/config/env.js";
import { DEFAULT_KOMMO_CLIENT_MAP } from "../server/config/env.js";
import { buildStatusMapFromKommo, inferStageFromStatusName } from "../server/config/kommoStageMap.js";
import { kommoGet } from "../server/lib/kommoApi.js";

type KommoPipelineStatus = { id: number; name: string };
type KommoPipeline = {
  id: number;
  name: string;
  _embedded?: { statuses?: KommoPipelineStatus[] };
};
type PipelinesResponse = { _embedded?: { pipelines?: KommoPipeline[] } };

async function main() {
  const data = await kommoGet<PipelinesResponse>("/leads/pipelines");
  const pipelines = data._embedded?.pipelines ?? [];

  console.log("=== Pipelines Inmoleads (dashboard) ===\n");
  const clientMap: Record<string, string> = {};
  const statuses: Array<{ id: number; name: string; pipeline_id: number }> = [];

  for (const p of pipelines) {
    const id = String(p.id);
    if (DEFAULT_KOMMO_CLIENT_MAP[id]) {
      clientMap[id] = DEFAULT_KOMMO_CLIENT_MAP[id];
      console.log(`${id} → ${p.name} → ${clientMap[id]}`);
      for (const s of p._embedded?.statuses ?? []) {
        statuses.push({ id: s.id, name: s.name, pipeline_id: p.id });
        const stage = inferStageFromStatusName(s.name);
        console.log(`    status ${s.id}: ${s.name} →`, stage);
      }
    }
  }

  const statusMap = buildStatusMapFromKommo(statuses);
  console.log("\nKOMMO_CLIENT_MAP (pegar en .env.local):\n");
  console.log(JSON.stringify(clientMap));
  console.log("\nKOMMO_STATUS_MAP (opcional, override manual):\n");
  console.log(JSON.stringify(statusMap, null, 2));
}

main().catch(console.error);
