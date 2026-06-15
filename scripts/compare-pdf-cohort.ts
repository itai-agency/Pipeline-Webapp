/**
 * Compara cohorte Kommo API vs objetivos PDF (created_at + estado actual).
 * Uso: node --use-system-ca --import tsx scripts/compare-pdf-cohort.ts 2026-01-01 2026-01-31
 */
import "../server/config/env.js";
import { getKommoClientMap } from "../server/config/env.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";
import { toAccountUnixRange } from "../server/lib/dateRanges.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import {
  classifyKommoStageTier,
  tierReachedMql,
} from "../server/config/kommoStageMap.js";

const since = process.argv[2] ?? "2026-01-01";
const until = process.argv[3] ?? "2026-01-31";

const TIER_RANK: Record<string, number> = {
  rejected: -1,
  entrada: 0,
  mql: 1,
  sql: 2,
  cita: 3,
  ofertado: 4,
  firmado: 5,
};

async function analyzeClient(
  client: string,
  pipelineId: number,
  statusTier: Map<number, ReturnType<typeof classifyKommoStageTier>>,
): Promise<{
  created: number;
  active: number;
  rejected: number;
  firmado: number;
  activeMql: number;
  gregorioMql: number;
  noEvRejected: number;
  dashConv: number;
  dashMql: number;
}> {
  const { from, to } = toAccountUnixRange(since, until);
  const cohort: Array<{ id: number; tier: ReturnType<typeof classifyKommoStageTier> }> = [];
  let page = 1;
  while (true) {
    const data = await kommoGet<{ _embedded?: { leads?: Array<{ id: number; status_id?: number }> } }>(
      "/leads",
      {
        params: {
          page,
          limit: 250,
          "filter[pipeline_id]": pipelineId,
          "filter[created_at][from]": from,
          "filter[created_at][to]": to,
        },
      },
    );
    for (const l of data._embedded?.leads ?? []) {
      cohort.push({ id: l.id, tier: statusTier.get(l.status_id ?? 0) ?? "entrada" });
    }
    const rows = data._embedded?.leads ?? [];
    if (!rows.length || rows.length < 250) break;
    page += 1;
  }

  const rejected = cohort.filter((c) => c.tier === "rejected");
  const firmado = cohort.filter((c) => c.tier === "firmado").length;
  const active = cohort.filter((c) => c.tier !== "rejected" && c.tier !== "firmado").length;
  const activeMql = cohort.filter(
    (c) => c.tier !== "rejected" && c.tier !== "firmado" && tierReachedMql(c.tier),
  ).length;

  const supabase = getSupabaseAdmin();
  let preMql = 0;
  let noEvRejected = 0;
  if (supabase) {
    for (let i = 0; i < rejected.length; i += 100) {
      const ids = rejected.slice(i, i + 100).map((r) => r.id);
      const { data } = await supabase
        .from("kommo_lead_events")
        .select("kommo_lead_id, status_id, event_date")
        .eq("client", client)
        .in("kommo_lead_id", ids)
        .lte("event_date", until)
        .not("kommo_event_id", "is", null)
        .order("event_date", { ascending: true });
      const byLead = new Map<number, Array<{ status_id: number | null }>>();
      for (const row of data ?? []) {
        const id = row.kommo_lead_id as number;
        const list = byLead.get(id) ?? [];
        list.push({ status_id: row.status_id as number | null });
        byLead.set(id, list);
      }
      for (const id of ids) {
        const ev = byLead.get(id) ?? [];
        if (!ev.length) {
          noEvRejected += 1;
          continue;
        }
        let max = -2;
        for (const e of ev) {
          const t = statusTier.get(e.status_id ?? 0) ?? "entrada";
          if (t === "rejected") break;
          if (TIER_RANK[t] > max) max = TIER_RANK[t];
        }
        if (max >= TIER_RANK.mql) preMql += 1;
      }
    }

    const { data: dash } = await supabase
      .from("dashboard_metrics_daily")
      .select("conversaciones, mql")
      .eq("client", client)
      .eq("metrics_source", "timeline")
      .gte("metric_date", since)
      .lte("metric_date", until);
    const dashConv = (dash ?? []).reduce((s, r) => s + ((r.conversaciones as number) ?? 0), 0);
    const dashMql = (dash ?? []).reduce((s, r) => s + ((r.mql as number) ?? 0), 0);
    return {
      created: cohort.length,
      active,
      rejected: rejected.length,
      firmado,
      activeMql,
      gregorioMql: activeMql + preMql,
      noEvRejected,
      dashConv,
      dashMql,
    };
  }

  return {
    created: cohort.length,
    active,
    rejected: rejected.length,
    firmado,
    activeMql,
    gregorioMql: activeMql + preMql,
    noEvRejected,
    dashConv: 0,
    dashMql: 0,
  };
}

async function main(): Promise<void> {
  const pipes = await kommoGet<{
    _embedded?: {
      pipelines?: Array<{ id: number; _embedded?: { statuses?: Array<{ id: number; name: string }> } }>;
    };
  }>("/leads/pipelines");

  console.log(`=== API vs Dashboard | ${since} → ${until} ===\n`);
  console.log(
    "Cliente          | API tot | act | rej | firm | Dash conv | dConv | Dash MQL | Greg MQL | rej sin ev",
  );
  console.log("-".repeat(95));

  for (const [pid, client] of Object.entries(getKommoClientMap()).sort((a, b) =>
    a[1].localeCompare(b[1]),
  )) {
    const statusTier = new Map<number, ReturnType<typeof classifyKommoStageTier>>();
    for (const s of pipes._embedded?.pipelines?.find((p) => p.id === Number(pid))?._embedded?.statuses ??
      []) {
      statusTier.set(s.id, classifyKommoStageTier(s.name));
    }
    const a = await analyzeClient(client, Number(pid), statusTier);
    const dConv = a.dashConv - a.created;
    console.log(
      `${client.padEnd(16)} | ${String(a.created).padStart(7)} | ${String(a.active).padStart(3)} | ${String(a.rejected).padStart(3)} | ${String(a.firmado).padStart(4)} | ${String(a.dashConv).padStart(9)} | ${String(dConv).padStart(5)} | ${String(a.dashMql).padStart(8)} | ${String(a.gregorioMql).padStart(8)} | ${String(a.noEvRejected).padStart(10)}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
