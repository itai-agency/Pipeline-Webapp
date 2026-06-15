import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { getKommoClientMap, isKommoConfigured } from "../../server/config/env.js";
import {
  classifyKommoStageTier,
  type KommoStageTier,
} from "../../server/config/kommoStageMap.js";
import { toAccountDateIso, toAccountUnixRange } from "../../server/lib/dateRanges.js";
import { kommoGet } from "../../server/lib/kommoApi.js";
import { getSupabaseAdmin } from "../../server/lib/supabase.js";

export const AUDIT_SINCE = process.env.KOMMO_AUDIT_SINCE ?? "2026-01-01";
export const AUDIT_UNTIL = process.env.KOMMO_AUDIT_UNTIL ?? "2026-06-30";
export const REPORTS_DIR = join(process.cwd(), "reports");

export const TIER_RANK: Record<KommoStageTier, number> = {
  rejected: -1,
  entrada: 0,
  mql: 1,
  sql: 2,
  cita: 3,
  ofertado: 4,
  firmado: 5,
};

export const RANK_TIER: Record<number, KommoStageTier> = {
  [-2]: "entrada",
  [-1]: "rejected",
  0: "entrada",
  1: "mql",
  2: "sql",
  3: "cita",
  4: "ofertado",
  5: "firmado",
};

export const TIER_DISPLAY: Record<KommoStageTier, string> = {
  rejected: "RECHAZADO",
  entrada: "Lead por calificar",
  mql: "MQL",
  sql: "SQL",
  cita: "CITA",
  ofertado: "OFERTADO",
  firmado: "FIRMADO",
};

export type LeadRow = {
  id: number;
  name: string;
  pipeline_id: number;
  client: string;
  created_at: number | null;
  closed_at: number | null;
  loss_reason_id: number | null;
  loss_reason_name: string | null;
};

export type TimelineRow = {
  kommo_lead_id: number;
  status_id: number | null;
  event_date: string;
  stage_name: string | null;
  raw_payload: { created_at?: number } | null;
};

export type LeadAuditRecord = {
  id: number;
  name: string;
  client: string;
  pipeline_id: number;
  motivo: string | null;
  motivo_tier: string;
  timeline_max_tier: KommoStageTier | "sin_eventos";
  timeline_max_rank: number;
  timeline_event_count: number;
  solo_rechazado: boolean;
  fecha_rechazo: string | null;
  fecha_creacion: string | null;
  bucket: string[];
};

export function ensureReportsDir(): void {
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
}

export function writeJsonReport(filename: string, data: unknown): void {
  ensureReportsDir();
  writeFileSync(join(REPORTS_DIR, filename), JSON.stringify(data, null, 2), "utf8");
}

export function formatDateDdMmYyyy(isoOrUnix: string | number | null): string | null {
  if (isoOrUnix == null) return null;
  const d =
    typeof isoOrUnix === "number"
      ? new Date(isoOrUnix * 1000)
      : new Date(`${isoOrUnix.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  return `${day}/${month}/${year}`;
}

export function motivoTierFromName(motivo: string | null | undefined): string {
  const u = (motivo ?? "").toUpperCase().trim();
  if (!motivo || u === "SIN ESPECIFICAR" || u === "—" || u === "-") return "unknown";
  if (u.startsWith("MQL-")) return "mql";
  if (u.startsWith("SQL-")) return "sql";
  if (u.startsWith("CITA-")) return "cita";
  if (u.startsWith("LXC-") || u.startsWith("LX-")) return "entrada";
  return "other";
}

export function motivoRank(motivoTier: string): number {
  const map: Record<string, number> = { unknown: -99, other: -99, entrada: 0, mql: 1, sql: 2, cita: 3 };
  return map[motivoTier] ?? -99;
}

export async function loadLossReasonCatalog(): Promise<Map<number, string>> {
  const data = await kommoGet<{
    _embedded?: { loss_reasons?: Array<{ id: number; name: string }> };
  }>("/leads/loss_reasons", { params: { limit: 250 }, timeout: 120_000 });
  const list = data._embedded?.loss_reasons ?? [];
  const map = new Map<number, string>();
  for (const r of list) map.set(r.id, r.name);
  return map;
}

export async function loadStatusTierMaps(): Promise<{
  statusTier: Map<number, KommoStageTier>;
  pipelineClients: Map<number, string>;
}> {
  const clientMap = getKommoClientMap();
  const pipelineClients = new Map<number, string>();
  for (const [pid, client] of Object.entries(clientMap)) {
    pipelineClients.set(Number(pid), client);
  }

  const pipes = await kommoGet<{
    _embedded?: {
      pipelines?: Array<{
        id: number;
        _embedded?: { statuses?: Array<{ id: number; name: string }> };
      }>;
    };
  }>("/leads/pipelines");

  const statusTier = new Map<number, KommoStageTier>();
  for (const p of pipes._embedded?.pipelines ?? []) {
    for (const s of p._embedded?.statuses ?? []) {
      statusTier.set(s.id, classifyKommoStageTier(s.name));
    }
  }
  return { statusTier, pipelineClients };
}

export function sortTimelineEvents(events: TimelineRow[]): TimelineRow[] {
  return [...events].sort((a, b) => {
    const ta = Number(a.raw_payload?.created_at ?? new Date(`${a.event_date}T12:00:00`).getTime() / 1000);
    const tb = Number(b.raw_payload?.created_at ?? new Date(`${b.event_date}T12:00:00`).getTime() / 1000);
    return ta - tb;
  });
}

export function computeMaxPreRejectTier(
  events: TimelineRow[],
  statusTier: Map<number, KommoStageTier>,
): { maxRank: number; maxTier: KommoStageTier | "sin_eventos"; soloRechazado: boolean } {
  if (!events.length) return { maxRank: -2, maxTier: "sin_eventos", soloRechazado: false };

  const sorted = sortTimelineEvents(events);
  const nonRejected = sorted.filter((e) => {
    const tier = statusTier.get(e.status_id ?? 0) ?? classifyKommoStageTier(e.stage_name ?? "");
    return tier !== "rejected";
  });
  const soloRechazado = nonRejected.length === 0;

  let max = -2;
  for (const ev of sorted) {
    const tier = statusTier.get(ev.status_id ?? 0) ?? classifyKommoStageTier(ev.stage_name ?? "");
    if (tier === "rejected") break;
    if (TIER_RANK[tier] > max) max = TIER_RANK[tier];
  }

  if (max < 0) return { maxRank: -2, maxTier: "sin_eventos", soloRechazado };
  return { maxRank: max, maxTier: RANK_TIER[max] ?? "entrada", soloRechazado };
}

export function rejectionDateFromLead(
  events: TimelineRow[],
  closedAt: number | null,
): string | null {
  const rej = events.find((e) => (e.stage_name ?? "").toUpperCase().includes("RECHAZ"));
  if (rej) return formatDateDdMmYyyy(rej.event_date);
  if (closedAt) return formatDateDdMmYyyy(closedAt);
  return null;
}

export async function fetchRejectedLeadsForPipeline(
  pipelineId: number,
  client: string,
  since: string,
  until: string,
  statusTier: Map<number, KommoStageTier>,
  lossReasons: Map<number, string>,
): Promise<LeadRow[]> {
  const { from, to } = toAccountUnixRange(since, until);
  const rows: LeadRow[] = [];
  let page = 1;

  while (true) {
    const data = await kommoGet<{
      _embedded?: {
        leads?: Array<{
          id: number;
          name?: string;
          pipeline_id?: number;
          status_id?: number;
          created_at?: number;
          closed_at?: number;
          loss_reason_id?: number | null;
        }>;
      };
    }>("/leads", {
      params: {
        page,
        limit: 250,
        "filter[pipeline_id]": pipelineId,
        "filter[created_at][from]": from,
        "filter[created_at][to]": to,
      },
      timeout: 120_000,
    });

    const batch = data._embedded?.leads ?? [];
    for (const l of batch) {
      const tier = statusTier.get(l.status_id ?? 0) ?? "entrada";
      if (tier !== "rejected") continue;
      const lrId = l.loss_reason_id ?? null;
      rows.push({
        id: l.id,
        name: (l.name ?? `Lead #${l.id}`).trim(),
        pipeline_id: l.pipeline_id ?? pipelineId,
        client,
        created_at: l.created_at ?? null,
        closed_at: l.closed_at ?? null,
        loss_reason_id: lrId,
        loss_reason_name: lrId != null ? (lossReasons.get(lrId) ?? null) : null,
      });
    }
    if (!batch.length || batch.length < 250) break;
    page += 1;
  }
  return rows;
}

export async function loadTimelinesForLeads(
  client: string,
  leadIds: number[],
): Promise<Map<number, TimelineRow[]>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase no configurado");

  const byLead = new Map<number, TimelineRow[]>();
  const chunk = 300;
  for (let i = 0; i < leadIds.length; i += chunk) {
    const ids = leadIds.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("kommo_lead_events")
      .select("kommo_lead_id, status_id, event_date, stage_name, raw_payload")
      .eq("client", client)
      .in("kommo_lead_id", ids)
      .not("kommo_event_id", "is", null);
    if (error) throw new Error(`Timeline load failed: ${error.message}`);

    for (const row of data ?? []) {
      const id = row.kommo_lead_id as number;
      const list = byLead.get(id) ?? [];
      list.push({
        kommo_lead_id: id,
        status_id: row.status_id as number | null,
        event_date: row.event_date as string,
        stage_name: row.stage_name as string | null,
        raw_payload: row.raw_payload as TimelineRow["raw_payload"],
      });
      byLead.set(id, list);
    }
  }
  return byLead;
}

export function classifyLeadRecord(
  lead: LeadRow,
  events: TimelineRow[],
  statusTier: Map<number, KommoStageTier>,
): LeadAuditRecord {
  const motivo = lead.loss_reason_name;
  const motivo_tier = motivoTierFromName(motivo);
  const { maxRank, maxTier, soloRechazado } = computeMaxPreRejectTier(events, statusTier);
  const buckets: string[] = [];

  const isLxc = (motivo ?? "").toUpperCase().startsWith("LXC-") || (motivo ?? "").toUpperCase().startsWith("LX-");
  if (isLxc && maxRank > TIER_RANK.entrada) {
    buckets.push("lxc_irregularity");
  }
  if (motivo_tier === "unknown") buckets.push("sin_especificar");
  if (soloRechazado && isLxc) buckets.push("solo_rechazado_lxc");
  if (soloRechazado && motivo_tier !== "unknown") buckets.push("solo_rechazado");

  const motivoRankVal = motivoRank(motivo_tier);
  if (
    motivo_tier === "mql" ||
    motivo_tier === "sql" ||
    motivo_tier === "cita"
  ) {
    if (motivoRankVal > maxRank) buckets.push("reconstruction_candidate");
  }

  return {
    id: lead.id,
    name: lead.name,
    client: lead.client,
    pipeline_id: lead.pipeline_id,
    motivo,
    motivo_tier,
    timeline_max_tier: maxTier,
    timeline_max_rank: maxRank,
    timeline_event_count: events.length,
    solo_rechazado: soloRechazado,
    fecha_rechazo: rejectionDateFromLead(events, lead.closed_at),
    fecha_creacion: lead.created_at ? formatDateDdMmYyyy(lead.created_at) : null,
    bucket: buckets,
  };
}

export async function runFullRejectionAudit(): Promise<{
  records: LeadAuditRecord[];
  summary: Record<string, unknown>;
}> {
  if (!isKommoConfigured()) throw new Error("Kommo no configurado");

  console.log(`Auditoría rechazos ${AUDIT_SINCE} → ${AUDIT_UNTIL}\n`);

  const lossReasons = await loadLossReasonCatalog();
  console.log(`Catálogo loss_reasons: ${lossReasons.size} entradas`);

  const { statusTier, pipelineClients } = await loadStatusTierMaps();
  const allRecords: LeadAuditRecord[] = [];

  for (const [pidStr, client] of Object.entries(getKommoClientMap()).sort((a, b) =>
    a[1].localeCompare(b[1]),
  )) {
    const pipelineId = Number(pidStr);
    console.log(`\n[${client}] pipeline ${pipelineId}…`);
    const leads = await fetchRejectedLeadsForPipeline(
      pipelineId,
      client,
      AUDIT_SINCE,
      AUDIT_UNTIL,
      statusTier,
      lossReasons,
    );
    console.log(`  rechazados API: ${leads.length}`);

    const timelines = await loadTimelinesForLeads(
      client,
      leads.map((l) => l.id),
    );

    for (const lead of leads) {
      const events = timelines.get(lead.id) ?? [];
      allRecords.push(classifyLeadRecord(lead, events, statusTier));
    }
  }

  const lxcIrregular = allRecords.filter((r) => r.bucket.includes("lxc_irregularity"));
  const sinEspec = allRecords.filter((r) => r.bucket.includes("sin_especificar"));
  const soloRech = allRecords.filter((r) => r.bucket.includes("solo_rechazado"));
  const recon = allRecords.filter((r) => r.bucket.includes("reconstruction_candidate"));

  const byClient = (arr: LeadAuditRecord[]) => {
    const m: Record<string, number> = {};
    for (const r of arr) m[r.client] = (m[r.client] ?? 0) + 1;
    return m;
  };

  const summary = {
    generated_at: new Date().toISOString(),
    cohort: { since: AUDIT_SINCE, until: AUDIT_UNTIL },
    totals: {
      rejected: allRecords.length,
      lxc_irregularity: lxcIrregular.length,
      sin_especificar: sinEspec.length,
      solo_rechazado: soloRech.length,
      reconstruction_candidate: recon.length,
    },
    by_client: {
      rejected: byClient(allRecords),
      lxc_irregularity: byClient(lxcIrregular),
      sin_especificar: byClient(sinEspec),
      solo_rechazado: byClient(soloRech),
    },
  };

  return { records: allRecords, summary };
}

export function assertAuditReady(): void {
  if (!isKommoConfigured()) {
    console.error("Kommo no configurado");
    process.exit(1);
  }
  if (!getSupabaseAdmin()) {
    console.error("Supabase no configurado");
    process.exit(1);
  }
}
