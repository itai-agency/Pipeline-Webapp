/** Depura rechazados DOS HOGARES con historial MQL+ por status_id. */
import "../server/config/env.js";
import { getKommoClientMap } from "../server/config/env.js";
import { classifyKommoStageTier, tierReachedMql } from "../server/config/kommoStageMap.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";

const CUTOFF = "2026-05-26";
const MONTH_START = "2026-05-01";

async function main() {
  const pid = Number(Object.entries(getKommoClientMap()).find(([, c]) => c === "DOS HOGARES")?.[0]);
  const pipes = await kommoGet<{
    _embedded?: { pipelines?: Array<{ id: number; _embedded?: { statuses?: Array<{ id: number; name: string }> } }> };
  }>("/leads/pipelines");
  const statuses = (pipes._embedded?.pipelines?.find((p) => p.id === pid)?._embedded?.statuses ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    tier: classifyKommoStageTier(s.name),
  }));
  const mqlPlusIds = new Set(statuses.filter((s) => tierReachedMql(s.tier)).map((s) => s.id));
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  const from = Math.floor(new Date(`${MONTH_START}T00:00:00`).getTime() / 1000);
  const to = Math.floor(new Date(`${CUTOFF}T23:59:59`).getTime() / 1000);
  const rejectedIds: number[] = [];
  let page = 1;
  while (true) {
    const data = await kommoGet<{ _embedded?: { leads?: Array<{ id: number; status_id?: number }> } }>("/leads", {
      params: { page, limit: 250, "filter[pipeline_id]": pid, "filter[created_at][from]": from, "filter[created_at][to]": to },
    });
    for (const l of data._embedded?.leads ?? []) {
      const tier = classifyKommoStageTier(statusById.get(l.status_id ?? 0)?.name ?? "");
      if (tier === "rejected") rejectedIds.push(l.id);
    }
    const rows = data._embedded?.leads ?? [];
    if (!rows.length || rows.length < 250) break;
    page += 1;
  }

  const supabase = getSupabaseAdmin()!;
  let withHist = 0;
  for (const id of rejectedIds) {
    const { data } = await supabase
      .from("kommo_lead_events")
      .select("event_date, status_id, stage_name, kommo_event_id, mql")
      .eq("client", "DOS HOGARES")
      .eq("kommo_lead_id", id)
      .lte("event_date", CUTOFF)
      .order("event_date", { ascending: true });
    const mqlEvents = (data ?? []).filter((e) => mqlPlusIds.has(e.status_id as number));
    if (mqlEvents.length) {
      withHist += 1;
      if (withHist <= 3) {
      console.log(`\nLead ${id} — ${mqlEvents.length} eventos en etapa MQL+`);
      for (const e of data ?? []) {
        const s = statusById.get(e.status_id as number);
        const flag = mqlPlusIds.has(e.status_id as number) ? "★" : " ";
        console.log(
          `  ${flag} ${e.event_date} status=${e.status_id} (${s?.name ?? e.stage_name}) mql_flag=${e.mql} event_id=${e.kommo_event_id ? "timeline" : "census"}`,
        );
      }
      }
    }
  }
  console.log(`\nTotal rechazados: ${rejectedIds.length}, con hist MQL+ status_id: ${withHist}`);
}

main().catch(console.error);
