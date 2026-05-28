/** Lista statuses del pipeline DOS HOGARES y leads mal clasificados vs HTML. */
import "../server/config/env.js";
import { getKommoClientMap } from "../server/config/env.js";
import { classifyKommoStageTier } from "../server/config/kommoStageMap.js";
import { kommoGet } from "../server/lib/kommoApi.js";

const MONTH_START = "2026-05-01";
const CUTOFF = "2026-05-26";

async function main() {
  const pid = Number(Object.entries(getKommoClientMap()).find(([, c]) => c === "DOS HOGARES")?.[0]);
  const pipes = await kommoGet<{
    _embedded?: { pipelines?: Array<{ id: number; name: string; _embedded?: { statuses?: Array<{ id: number; name: string; type?: number }> } }> };
  }>("/leads/pipelines");
  const pipeline = pipes._embedded?.pipelines?.find((p) => p.id === pid);
  console.log(`Pipeline ${pipeline?.name} (${pid})\nStatuses:`);
  for (const s of pipeline?._embedded?.statuses ?? []) {
    const tier = classifyKommoStageTier(s.name);
    console.log(`  [${s.id}] type=${s.type} tier=${tier}  "${s.name}"`);
  }

  const from = Math.floor(new Date(`${MONTH_START}T00:00:00`).getTime() / 1000);
  const to = Math.floor(new Date(`${CUTOFF}T23:59:59`).getTime() / 1000);
  const byStatus = new Map<number, number>();
  let page = 1;
  while (true) {
    const data = await kommoGet<{ _embedded?: { leads?: Array<{ id: number; status_id?: number }> } }>("/leads", {
      params: { page, limit: 250, "filter[pipeline_id]": pid, "filter[created_at][from]": from, "filter[created_at][to]": to },
    });
    const rows = data._embedded?.leads ?? [];
    for (const l of rows) {
      byStatus.set(l.status_id ?? 0, (byStatus.get(l.status_id ?? 0) ?? 0) + 1);
    }
    if (!rows.length || rows.length < 250) break;
    page += 1;
  }
  console.log("\nLeads por status_id:");
  for (const s of pipeline?._embedded?.statuses ?? []) {
    const n = byStatus.get(s.id) ?? 0;
    if (n === 0) continue;
    const tier = classifyKommoStageTier(s.name);
    console.log(`  ${String(n).padStart(3)} × [${s.id}] tier=${tier}  "${s.name}"`);
  }
}

main().catch(console.error);
