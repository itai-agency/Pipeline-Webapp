/**
 * Encuentra qué definición de reachedMql reproduce el HTML del jefe.
 * Cohorte = leads created_at en el mes del corte.
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

function toUnixRange(since: string, until: string): { from: number; to: number } {
  const from = Math.floor(new Date(`${since}T00:00:00`).getTime() / 1000);
  const to = Math.floor(new Date(`${until}T23:59:59`).getTime() / 1000);
  return { from, to };
}

type CohortLead = { id: number; pipeline_id?: number; status_id?: number };

async function fetchCohort(pipelineId: number): Promise<CohortLead[]> {
  const { from, to } = toUnixRange(MONTH_START, CUTOFF);
  const all: CohortLead[] = [];
  let page = 1;
  while (true) {
    const data = await kommoGet<{ _embedded?: { leads?: CohortLead[] } }>("/leads", {
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

async function loadEventsUpToCutoff(
  client: string,
  leadIds: number[],
): Promise<Map<number, { mql: number; sql: number; citas: number }>> {
  const supabase = getSupabaseAdmin()!;
  const byLead = new Map<number, { mql: number; sql: number; citas: number }>();
  const chunk = 400;
  for (let i = 0; i < leadIds.length; i += chunk) {
    const ids = leadIds.slice(i, i + chunk);
    const { data } = await supabase
      .from("kommo_lead_events")
      .select("kommo_lead_id, mql, sql, citas, event_date")
      .eq("client", client)
      .in("kommo_lead_id", ids)
      .lte("event_date", CUTOFF)
      .not("kommo_event_id", "is", null);
    for (const r of data ?? []) {
      const id = r.kommo_lead_id as number;
      const prev = byLead.get(id) ?? { mql: 0, sql: 0, citas: 0 };
      byLead.set(id, {
        mql: Math.max(prev.mql, (r.mql as number) ?? 0),
        sql: Math.max(prev.sql, (r.sql as number) ?? 0),
        citas: Math.max(prev.citas, (r.citas as number) ?? 0),
      });
    }
  }
  return byLead;
}

function countReached(
  cohort: Array<{ id: number; tier: KommoStageTier }>,
  events: Map<number, { mql: number; sql: number; citas: number }>,
  mode: "tier" | "events" | "union" | "union_not_rejected",
): { mql: number; sql: number; cita: number } {
  let mql = 0;
  let sql = 0;
  let cita = 0;
  for (const { id, tier } of cohort) {
    const ev = events.get(id);
    const rMql =
      mode === "tier"
        ? tierReachedMql(tier)
        : mode === "events"
          ? (ev?.mql ?? 0) > 0
          : mode === "union"
            ? tierReachedMql(tier) || (ev?.mql ?? 0) > 0
            : tier !== "rejected" && (tierReachedMql(tier) || (ev?.mql ?? 0) > 0);
    const rSql =
      mode === "tier"
        ? tierReachedSql(tier)
        : mode === "events"
          ? (ev?.sql ?? 0) > 0
          : tierReachedSql(tier) || (ev?.sql ?? 0) > 0;
    const rCita =
      mode === "tier"
        ? tierReachedCita(tier)
        : mode === "events"
          ? (ev?.citas ?? 0) > 0
          : tierReachedCita(tier) || (ev?.citas ?? 0) > 0;
    if (rMql) mql += 1;
    if (rSql) sql += 1;
    if (rCita) cita += 1;
  }
  return { mql, sql, cita };
}

async function main(): Promise<void> {
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

  const modes = ["tier", "events", "union", "union_not_rejected"] as const;
  const scores: Record<string, number> = Object.fromEntries(modes.map((m) => [m, 0]));

  console.log(`Cohorte created_at ${MONTH_START}→${CUTOFF} · eventos BD hasta ${CUTOFF}\n`);

  for (const [pid, client] of Object.entries(getKommoClientMap())) {
    const html = KOMMO_CONTROL_REFERENCE.clients[client];
    if (!html) continue;

    const raw = await fetchCohort(Number(pid));
    const cohort: Array<{ id: number; tier: KommoStageTier }> = [];
    for (const lead of raw) {
      const name =
        statusName.get(`${lead.pipeline_id ?? pid}:${lead.status_id}`) ??
        statusName.get(String(lead.status_id)) ??
        "";
      const tier = classifyKommoStageTier(name);
      if (tier === "firmado") continue;
      cohort.push({ id: lead.id, tier });
    }

    const events = await loadEventsUpToCutoff(client, cohort.map((c) => c.id));
    const leads = cohort.length;

    console.log(`── ${client} ── HTML leads=${html.leads} mql=${html.reachedMql} sql=${html.reachedSql} cita=${html.reachedCita}`);
    console.log(`   cohort API leads=${leads} · leads con eventos=${events.size}`);

    for (const mode of modes) {
      const r = countReached(cohort, events, mode);
      const ok = r.mql === html.reachedMql && r.sql === html.reachedSql && r.cita === html.reachedCita;
      if (ok) scores[mode] += 1;
      const mark = r.mql === html.reachedMql ? "✓mql" : `mqlΔ${r.mql - html.reachedMql}`;
      console.log(
        `   ${mode.padEnd(18)} mql=${String(r.mql).padStart(3)} sql=${String(r.sql).padStart(3)} cita=${String(r.cita).padStart(3)}  ${mark}`,
      );
    }
    console.log("");
  }

  console.log("Clientes con match exacto mql+sql+cita:");
  for (const [mode, n] of Object.entries(scores)) {
    console.log(`  ${mode}: ${n}/6`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
