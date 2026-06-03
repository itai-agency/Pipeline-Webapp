/**
 * Encuentra la formula diaria que replica RESPALDO_DIARIO usando historial Kommo por lead.
 * Usa raw_payload (value_before / value_after) para transiciones reales.
 *
 * npx tsx scripts/probe-excel-daily-formula.ts
 * npx tsx scripts/probe-excel-daily-formula.ts "DOS HOGARES"
 */
import "../server/config/env.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { getKommoClientMap } from "../server/config/env.js";
import {
  classifyKommoStageTier,
  type KommoStageTier,
} from "../server/config/kommoStageMap.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";

const MONTH_START = "2026-05-01";
const CUTOFF = "2026-05-26";

const TIER_RANK: Record<KommoStageTier, number> = {
  rejected: -1,
  entrada: 0,
  mql: 1,
  sql: 2,
  cita: 3,
  ofertado: 4,
  firmado: 5,
};

const leadStatusChangeSchema = z.object({
  lead_status: z.object({
    id: z.coerce.number(),
    pipeline_id: z.coerce.number(),
  }),
});

type ExcelDay = { fecha: string; conv: number; mql: number; sql: number; citas: number; firmas: number };

type ParsedEvent = {
  kommo_lead_id: number;
  event_date: string;
  lead_created_date: string | null;
  afterStatusId: number;
  beforeStatusId: number | null;
  afterTier: KommoStageTier;
  beforeTier: KommoStageTier;
};

function parseStatusFromPayload(
  arr: Array<Record<string, unknown>> | undefined,
): { statusId: number; pipelineId: number } | null {
  if (!arr?.length) return null;
  const parsed = leadStatusChangeSchema.safeParse(arr[0]);
  if (!parsed.success) return null;
  return { statusId: parsed.data.lead_status.id, pipelineId: parsed.data.lead_status.pipeline_id };
}

function toUnixRange(since: string, until: string) {
  const from = Math.floor(new Date(`${since}T00:00:00`).getTime() / 1000);
  const to = Math.floor(new Date(`${until}T23:59:59`).getTime() / 1000);
  return { from, to };
}

function tierFromId(
  statusId: number,
  statusName: Map<string, string>,
  pipelineId: number,
): KommoStageTier {
  const name = statusName.get(`${pipelineId}:${statusId}`) ?? statusName.get(String(statusId)) ?? "";
  return classifyKommoStageTier(name);
}

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

type DayMetrics = Record<string, number>;

type FormulaSet = {
  conv_newLeads: DayMetrics;
  conv_anyEventLead: DayMetrics;
  conv_statusChanges: DayMetrics;
  conv_firstTouch: DayMetrics;
  mql_enterStrict: DayMetrics;
  mql_enterPlus: DayMetrics;
  mql_firstMaxCross: DayMetrics;
  mql_distinctPlus: DayMetrics;
  sql_enterStrict: DayMetrics;
  cita_enterStrict: DayMetrics;
  firma_enterStrict: DayMetrics;
};

function emptyDayMap(dates: string[]): DayMetrics {
  return Object.fromEntries(dates.map((d) => [d, 0]));
}

function scoreMatch(excel: ExcelDay[], kommo: DayMetrics, field: keyof ExcelDay): { exact: number; total: number; mae: number } {
  let exact = 0;
  let mae = 0;
  let total = 0;
  for (const row of excel) {
    if (row.fecha < MONTH_START || row.fecha > CUTOFF) continue;
    total += 1;
    const k = Math.round(kommo[row.fecha] ?? 0);
    const e = Math.round(row[field]);
    if (k === e) exact += 1;
    mae += Math.abs(k - e);
  }
  return { exact, total, mae };
}

async function analyzeClient(client: string, pipelineId: number, statusName: Map<string, string>) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const excelAll = JSON.parse(
    readFileSync(join(root, "reports/excel_daily_by_client.json"), "utf8"),
  ) as Record<string, ExcelDay[]>;
  const excel = (excelAll[client] ?? []).filter((d) => d.fecha >= MONTH_START && d.fecha <= CUTOFF);
  const dates = [...new Set(excel.map((d) => d.fecha))].sort();

  const { from, to } = toUnixRange(MONTH_START, CUTOFF);
  const cohort: Array<{ id: number; createdDate: string }> = [];
  let page = 1;
  while (true) {
    const data = await kommoGet<{ _embedded?: { leads?: Array<{ id: number; created_at?: number }> } }>(
      "/leads",
      { params: { page, limit: 250, "filter[pipeline_id]": pipelineId, "filter[created_at][from]": from, "filter[created_at][to]": to } },
    );
    for (const l of data._embedded?.leads ?? []) {
      const cd = l.created_at
        ? new Date(l.created_at * 1000).toISOString().slice(0, 10)
        : MONTH_START;
      cohort.push({ id: l.id, createdDate: cd });
    }
    const n = data._embedded?.leads?.length ?? 0;
    if (n < 250) break;
    page += 1;
  }
  const cohortSet = new Set(cohort.map((c) => c.id));

  const supabase = getSupabaseAdmin()!;
  const parsed: ParsedEvent[] = [];
  const ids = cohort.map((c) => c.id);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data } = await supabase
      .from("kommo_lead_events")
      .select("kommo_lead_id, event_date, lead_created_date, status_id, pipeline_id, raw_payload, kommo_event_id")
      .eq("client", client)
      .in("kommo_lead_id", chunk)
      .lte("event_date", CUTOFF)
      .not("kommo_event_id", "is", null)
      .order("event_date", { ascending: true });
    for (const r of data ?? []) {
      const payload = r.raw_payload as {
        value_after?: Array<Record<string, unknown>>;
        value_before?: Array<Record<string, unknown>>;
      } | null;
      const after = parseStatusFromPayload(payload?.value_after);
      const before = parseStatusFromPayload(payload?.value_before);
      const pid = after?.pipelineId ?? (r.pipeline_id as number) ?? pipelineId;
      const afterId = after?.statusId ?? (r.status_id as number);
      if (!afterId) continue;
      const afterTier = tierFromId(afterId, statusName, pid);
      const beforeTier = before
        ? tierFromId(before.statusId, statusName, before.pipelineId)
        : afterTier;
      parsed.push({
        kommo_lead_id: r.kommo_lead_id as number,
        event_date: r.event_date as string,
        lead_created_date: (r.lead_created_date as string) ?? null,
        afterStatusId: afterId,
        beforeStatusId: before?.statusId ?? null,
        afterTier,
        beforeTier,
      });
    }
  }

  const formulas: FormulaSet = {
    conv_newLeads: emptyDayMap(dates),
    conv_anyEventLead: emptyDayMap(dates),
    conv_statusChanges: emptyDayMap(dates),
    conv_firstTouch: emptyDayMap(dates),
    mql_enterStrict: emptyDayMap(dates),
    mql_enterPlus: emptyDayMap(dates),
    mql_firstMaxCross: emptyDayMap(dates),
    mql_distinctPlus: emptyDayMap(dates),
    sql_enterStrict: emptyDayMap(dates),
    cita_enterStrict: emptyDayMap(dates),
    firma_enterStrict: emptyDayMap(dates),
  };

  for (const { id, createdDate } of cohort) {
    if (createdDate >= MONTH_START && createdDate <= CUTOFF) {
      formulas.conv_newLeads[createdDate] = (formulas.conv_newLeads[createdDate] ?? 0) + 1;
    }
  }

  const firstEventDay = new Map<number, string>();
  const maxRankByLeadDate = new Map<number, Map<string, number>>();

  for (const ev of parsed) {
    if (!cohortSet.has(ev.kommo_lead_id)) continue;
    const d = ev.event_date;
    formulas.conv_statusChanges[d] = (formulas.conv_statusChanges[d] ?? 0) + 1;

    if (!firstEventDay.has(ev.kommo_lead_id)) {
      firstEventDay.set(ev.kommo_lead_id, d);
      formulas.conv_firstTouch[d] = (formulas.conv_firstTouch[d] ?? 0) + 1;
    }

    const distinctKey = `${d}`;
    void distinctKey;

    if (TIER_RANK[ev.afterTier] >= TIER_RANK.mql) {
      formulas.mql_distinctPlus[d] = formulas.mql_distinctPlus[d] ?? 0;
    }

    if (ev.beforeTier !== ev.afterTier) {
      if (ev.afterTier === "mql") formulas.mql_enterStrict[d] = (formulas.mql_enterStrict[d] ?? 0) + 1;
      if (ev.afterTier === "sql") formulas.sql_enterStrict[d] = (formulas.sql_enterStrict[d] ?? 0) + 1;
      if (ev.afterTier === "cita") formulas.cita_enterStrict[d] = (formulas.cita_enterStrict[d] ?? 0) + 1;
      if (ev.afterTier === "firmado") formulas.firma_enterStrict[d] = (formulas.firma_enterStrict[d] ?? 0) + 1;

      const prevRank = TIER_RANK[ev.beforeTier];
      const nextRank = TIER_RANK[ev.afterTier];
      if (nextRank > prevRank && nextRank >= TIER_RANK.mql && ev.afterTier !== "firmado") {
        formulas.mql_enterPlus[d] = (formulas.mql_enterPlus[d] ?? 0) + 1;
      }
    }

    if (!maxRankByLeadDate.has(ev.kommo_lead_id)) maxRankByLeadDate.set(ev.kommo_lead_id, new Map());
    const leadMap = maxRankByLeadDate.get(ev.kommo_lead_id)!;
    const prev = leadMap.get(d) ?? -2;
    if (TIER_RANK[ev.afterTier] > prev) leadMap.set(d, TIER_RANK[ev.afterTier]);
  }

  const distinctPlusByDay = new Map<string, Set<number>>();
  for (const ev of parsed) {
    if (!cohortSet.has(ev.kommo_lead_id)) continue;
    if (TIER_RANK[ev.afterTier] >= TIER_RANK.mql && ev.afterTier !== "firmado") {
      const set = distinctPlusByDay.get(ev.event_date) ?? new Set();
      set.add(ev.kommo_lead_id);
      distinctPlusByDay.set(ev.event_date, set);
    }
  }
  for (const [d, set] of distinctPlusByDay) {
    formulas.mql_distinctPlus[d] = set.size;
  }

  const distinctEventByDay = new Map<string, Set<number>>();
  for (const ev of parsed) {
    if (!cohortSet.has(ev.kommo_lead_id)) continue;
    const set = distinctEventByDay.get(ev.event_date) ?? new Set();
    set.add(ev.kommo_lead_id);
    distinctEventByDay.set(ev.event_date, set);
  }
  for (const [d, set] of distinctEventByDay) {
    formulas.conv_anyEventLead[d] = set.size;
  }

  for (const fecha of dates) {
    let cross = 0;
    const prevEnd = dayBefore(fecha);
    for (const id of cohort.map((c) => c.id)) {
      const events = parsed.filter((e) => e.kommo_lead_id === id && e.event_date <= fecha);
      let maxPrev = -2;
      let maxNow = -2;
      for (const e of events) {
        const r = TIER_RANK[e.afterTier];
        if (e.event_date <= prevEnd) maxPrev = Math.max(maxPrev, r);
        maxNow = Math.max(maxNow, r);
      }
      if (maxPrev < TIER_RANK.mql && maxNow >= TIER_RANK.mql) cross += 1;
    }
    formulas.mql_firstMaxCross[fecha] = cross;
  }

  const convScores = [
    { id: "conv_newLeads", ...scoreMatch(excel, formulas.conv_newLeads, "conv") },
    { id: "conv_anyEventLead", ...scoreMatch(excel, formulas.conv_anyEventLead, "conv") },
    { id: "conv_statusChanges", ...scoreMatch(excel, formulas.conv_statusChanges, "conv") },
    { id: "conv_firstTouch", ...scoreMatch(excel, formulas.conv_firstTouch, "conv") },
  ].sort((a, b) => b.exact - a.exact || a.mae - b.mae);

  const mqlScores = [
    { id: "mql_enterStrict", ...scoreMatch(excel, formulas.mql_enterStrict, "mql") },
    { id: "mql_enterPlus", ...scoreMatch(excel, formulas.mql_enterPlus, "mql") },
    { id: "mql_firstMaxCross", ...scoreMatch(excel, formulas.mql_firstMaxCross, "mql") },
    { id: "mql_distinctPlus", ...scoreMatch(excel, formulas.mql_distinctPlus, "mql") },
  ].sort((a, b) => b.exact - a.exact || a.mae - b.mae);

  const sqlScore = scoreMatch(excel, formulas.sql_enterStrict, "sql");
  const citaScore = scoreMatch(excel, formulas.cita_enterStrict, "citas");
  const firmaScore = scoreMatch(excel, formulas.firma_enterStrict, "firmas");

  console.log(`\n======== ${client} (cohorte=${cohort.length}, eventos=${parsed.length}) ========`);
  console.log("CONV — mejor formula:");
  for (const s of convScores) {
    console.log(`  ${s.id.padEnd(22)} exact=${s.exact}/${s.total}  MAE=${s.mae.toFixed(0)}`);
  }
  console.log("MQL — mejor formula:");
  for (const s of mqlScores) {
    console.log(`  ${s.id.padEnd(22)} exact=${s.exact}/${s.total}  MAE=${s.mae.toFixed(0)}`);
  }
  console.log(`SQL enterStrict     exact=${sqlScore.exact}/${sqlScore.total} MAE=${sqlScore.mae}`);
  console.log(`CITAS enterStrict   exact=${citaScore.exact}/${citaScore.total} MAE=${citaScore.mae}`);
  console.log(`FIRMAS enterStrict  exact=${firmaScore.exact}/${firmaScore.total} MAE=${firmaScore.mae}`);

  const bestConv = convScores[0]!;
  const bestMql = mqlScores[0]!;
  console.log("\nMuestra dias con mayor error MQL (excel vs enterStrict):");
  let shown = 0;
  for (const row of excel) {
    const e = Math.round(row.mql);
    const k = Math.round(formulas.mql_enterStrict[row.fecha] ?? 0);
    if (e !== k && shown < 8) {
      const plus = Math.round(formulas.mql_enterPlus[row.fecha] ?? 0);
      const cross = Math.round(formulas.mql_firstMaxCross[row.fecha] ?? 0);
      console.log(`  ${row.fecha} Excel=${e} strict=${k} enterPlus=${plus} firstCross=${cross} convEx=${row.conv} convNew=${formulas.conv_newLeads[row.fecha] ?? 0}`);
      shown += 1;
    }
  }

  return {
    client,
    bestConv: bestConv.id,
    bestMql: bestMql.id,
    convExact: bestConv.exact,
    mqlExact: bestMql.exact,
    sqlExact: sqlScore.exact,
  };
}

async function main() {
  const arg = process.argv[2]?.replace(/_/g, " ");
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

  const clients = arg
    ? [[Object.entries(getKommoClientMap()).find(([, c]) => c === arg.toUpperCase())?.[0], arg.toUpperCase()] as const]
    : Object.entries(getKommoClientMap());

  const summary = [];
  for (const [pid, client] of clients) {
    if (!pid || !client) continue;
    summary.push(await analyzeClient(client, Number(pid), statusName));
  }

  console.log("\n======== RESUMEN GLOBAL ========");
  console.log("Cliente          | mejor CONV        | match | mejor MQL         | match");
  for (const s of summary) {
    console.log(
      `${s.client.padEnd(16)} | ${s.bestConv.padEnd(17)} | ${String(s.convExact).padStart(5)} | ${s.bestMql.padEnd(17)} | ${String(s.mqlExact).padStart(5)}`,
    );
  }

  console.log("\n--- Formula propuesta para automatizar Excel ---");
  console.log("CONVERSACIONES/dia = leads de la cohorte con created_at ese dia (nuevos en el mes)");
  console.log("MQL/dia  = transiciones reales (value_before->value_after) que ENTRAN a etapa MQL");
  console.log("SQL/dia  = transiciones que ENTRAN a etapa SQL");
  console.log("CITAS/dia = transiciones que ENTRAN a etapa CITA");
  console.log("FIRMAS/dia = transiciones que ENTRAN a etapa FIRMADO");

  fetch("http://127.0.0.1:7880/ingest/6fd1d614-7a66-4dcc-a425-d3b833f324c4", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a0037c" },
    body: JSON.stringify({
      sessionId: "a0037c",
      runId: "daily-formula",
      hypothesisId: "H-daily-mold",
      location: "probe-excel-daily-formula.ts",
      message: "daily formula scores",
      data: { summary },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
