/**
 * Desglose de rechazados por estado máximo ANTES del primer evento "rechazado".
 *
 * Uso:
 *   node --use-system-ca --import tsx scripts/probe-rejected-max-tier.ts
 *   node --use-system-ca --import tsx scripts/probe-rejected-max-tier.ts HOGARES
 *   KOMMO_PROBE_SINCE=2026-05-01 KOMMO_PROBE_UNTIL=2026-05-26 node --use-system-ca --import tsx scripts/probe-rejected-max-tier.ts HOGARES
 */
import "../server/config/env.js";
import { getKommoClientMap, isKommoConfigured } from "../server/config/env.js";
import {
  classifyKommoStageTier,
  tierReachedCita,
  tierReachedMql,
  tierReachedSql,
  type KommoStageTier,
} from "../server/config/kommoStageMap.js";
import { toAccountUnixRange } from "../server/lib/dateRanges.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";

const clientArg = (process.argv[2] ?? "HOGARES").replace(/_/g, " ").toUpperCase();
const since = process.env.KOMMO_PROBE_SINCE ?? "2026-05-01";
const until = process.env.KOMMO_PROBE_UNTIL ?? "2026-05-26";

const TIER_RANK: Record<KommoStageTier, number> = {
  rejected: -1,
  entrada: 0,
  mql: 1,
  sql: 2,
  cita: 3,
  ofertado: 4,
  firmado: 5,
};

const RANK_LABEL: Record<number, string> = {
  [-2]: "sin_eventos",
  [-1]: "rejected",
  0: "entrada",
  1: "mql",
  2: "sql",
  3: "cita",
  4: "ofertado",
  5: "firmado",
};

function resolveClient(): { client: string; pipelineId: number } {
  const map = getKommoClientMap();
  const entry = Object.entries(map).find(([, c]) => c.toUpperCase() === clientArg);
  if (!entry) {
    throw new Error(`Cliente no encontrado: ${clientArg}. Opciones: ${Object.values(map).join(", ")}`);
  }
  return { client: entry[1], pipelineId: Number(entry[0]) };
}

async function main(): Promise<void> {
  if (!isKommoConfigured()) {
    console.error("Kommo no configurado");
    process.exit(1);
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error("Supabase no configurado");
    process.exit(1);
  }

  const { client, pipelineId } = resolveClient();
  const { from, to } = toAccountUnixRange(since, until);

  const pipes = await kommoGet<{
    _embedded?: {
      pipelines?: Array<{ id: number; _embedded?: { statuses?: Array<{ id: number; name: string }> } }>;
    };
  }>("/leads/pipelines");

  const statusTier = new Map<number, KommoStageTier>();
  const statusName = new Map<number, string>();
  for (const s of pipes._embedded?.pipelines?.find((p) => p.id === pipelineId)?._embedded?.statuses ?? []) {
    statusTier.set(s.id, classifyKommoStageTier(s.name));
    statusName.set(s.id, s.name);
  }

  const cohort: Array<{ id: number; tier: KommoStageTier }> = [];
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
    const rows = data._embedded?.leads ?? [];
    for (const l of rows) {
      const tier = statusTier.get(l.status_id ?? 0) ?? "entrada";
      if (tier !== "firmado") cohort.push({ id: l.id, tier });
    }
    if (!rows.length || rows.length < 250) break;
    page += 1;
  }

  const rejected = cohort.filter((c) => c.tier === "rejected");
  const rejectedIds = rejected.map((c) => c.id);
  const preRejectMax = new Map<number, number>();

  const chunk = 200;
  for (let i = 0; i < rejectedIds.length; i += chunk) {
    const ids = rejectedIds.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("kommo_lead_events")
      .select("kommo_lead_id, status_id, event_date, stage_name")
      .eq("client", client)
      .in("kommo_lead_id", ids)
      .lte("event_date", until)
      .not("kommo_event_id", "is", null)
      .order("event_date", { ascending: true });
    if (error) throw new Error(error.message);

    const byLead = new Map<number, Array<{ status_id: number | null; event_date: string }>>();
    for (const row of data ?? []) {
      const id = row.kommo_lead_id as number;
      const list = byLead.get(id) ?? [];
      list.push({ status_id: row.status_id as number | null, event_date: row.event_date as string });
      byLead.set(id, list);
    }

    for (const id of ids) {
      const events = byLead.get(id) ?? [];
      let max = -2;
      for (const ev of events) {
        const tier = statusTier.get(ev.status_id ?? 0) ?? "entrada";
        if (tier === "rejected") break;
        if (TIER_RANK[tier] > max) max = TIER_RANK[tier];
      }
      preRejectMax.set(id, max);
    }
  }

  const byMaxTier = new Map<number, number>();
  for (const id of rejectedIds) {
    const max = preRejectMax.get(id) ?? -2;
    byMaxTier.set(max, (byMaxTier.get(max) ?? 0) + 1);
  }

  let preRejectMql = 0;
  let preRejectSql = 0;
  let preRejectCita = 0;
  for (const id of rejectedIds) {
    const max = preRejectMax.get(id) ?? -2;
    if (max >= TIER_RANK.mql) preRejectMql += 1;
    if (max >= TIER_RANK.sql) preRejectSql += 1;
    if (max >= TIER_RANK.cita) preRejectCita += 1;
  }

  const activeMql = cohort.filter((c) => c.tier !== "rejected" && tierReachedMql(c.tier)).length;
  const activeSql = cohort.filter((c) => c.tier !== "rejected" && tierReachedSql(c.tier)).length;
  const activeCita = cohort.filter((c) => c.tier !== "rejected" && tierReachedCita(c.tier)).length;

  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Rechazados · estado máximo pre-rechazo · ${client}`);
  console.log(`  Cohorte created_at: ${since} → ${until}  |  Timeline hasta ${until}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log(`Cohorte total (sin firmados): ${cohort.length}`);
  console.log(`Rechazados hoy en Kommo:      ${rejected.length}\n`);

  console.log("--- Desglose por estado máximo ANTES del primer rechazo ---");
  const order = [-2, 0, 1, 2, 3, 4, 5];
  for (const rank of order) {
    const n = byMaxTier.get(rank) ?? 0;
    if (n === 0 && rank === -2) continue;
    console.log(`  ${RANK_LABEL[rank]?.padEnd(12) ?? rank}: ${n}`);
  }
  const accounted = [...byMaxTier.values()].reduce((a, b) => a + b, 0);
  console.log(`  ${"TOTAL".padEnd(12)}: ${accounted}`);

  const noEvents = byMaxTier.get(-2) ?? 0;
  if (noEvents > 0) {
    console.log(`\n  (${noEvents} rechazados sin eventos timeline en BD → max = sin_eventos)`);
  }

  console.log("\n--- Sumatoria validación (embudo Gregorio) ---");
  console.log(`  Activos MQL+ (no rechazados):     ${activeMql}`);
  console.log(`  Rechazados con max >= MQL:        ${preRejectMql}`);
  console.log(`  → reachedMql (activos + preRej):  ${activeMql + preRejectMql}`);
  console.log("");
  console.log(`  Activos SQL+:                     ${activeSql}`);
  console.log(`  Rechazados con max >= SQL:        ${preRejectSql}`);
  console.log(`  → reachedSql:                     ${activeSql + preRejectSql}`);
  console.log("");
  console.log(`  Activos CITA+:                    ${activeCita}`);
  console.log(`  Rechazados con max >= CITA:       ${preRejectCita}`);
  console.log(`  → reachedCita:                    ${activeCita + preRejectCita}`);

  console.log("\n--- Muestra (hasta 10 rechazados con max >= MQL) ---");
  let shown = 0;
  for (const { id } of rejected) {
    const max = preRejectMax.get(id) ?? -2;
    if (max < TIER_RANK.mql) continue;
    shown += 1;
    if (shown > 10) break;
    console.log(`  lead ${id}: max=${RANK_LABEL[max] ?? max}`);
  }
  if (shown === 0) console.log("  (ninguno)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
