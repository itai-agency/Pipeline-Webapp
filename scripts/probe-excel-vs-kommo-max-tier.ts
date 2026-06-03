/**
 * Compara Excel RESPALDO_DIARIO vs eventos Kommo (cohorte created_at mayo).
 * Prueba si "maximo estado alcanzado" explica lo que el equipo captura en Excel.
 *
 * Uso: npx tsx scripts/probe-excel-vs-kommo-max-tier.ts DOS_HOGARES
 *      npx tsx scripts/probe-excel-vs-kommo-max-tier.ts INSPIRA
 */
import "../server/config/env.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getKommoClientMap } from "../server/config/env.js";
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

const TIER_RANK: Record<KommoStageTier, number> = {
  rejected: -1,
  entrada: 0,
  mql: 1,
  sql: 2,
  cita: 3,
  ofertado: 4,
  firmado: 5,
};

type ExcelDay = { fecha: string; conv: number; mql: number; sql: number; citas: number; firmas: number };
type KommoEvent = {
  kommo_lead_id: number;
  event_date: string;
  status_id: number | null;
  stage_name: string | null;
  pipeline_id: number | null;
  mql: number;
  sql: number;
  citas: number;
  conversations: number;
};

function toUnixRange(since: string, until: string) {
  const from = Math.floor(new Date(`${since}T00:00:00`).getTime() / 1000);
  const to = Math.floor(new Date(`${until}T23:59:59`).getTime() / 1000);
  return { from, to };
}

function tierFromStatus(
  statusId: number | null,
  stageName: string | null,
  statusName: Map<string, string>,
  pipelineId: number,
  pipelineIdEv?: number | null,
): KommoStageTier {
  const name =
    stageName ||
    statusName.get(`${pipelineIdEv ?? pipelineId}:${statusId}`) ||
    statusName.get(String(statusId)) ||
    "";
  return classifyKommoStageTier(name);
}

function loadExcelDaily(client: string): ExcelDay[] {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const json = JSON.parse(readFileSync(join(root, "reports/manual_xlsx_deep.json"), "utf8")) as {
    mayo_last_5_days_sample?: Record<string, ExcelDay[]>;
  };
  // Re-parse full daily from embedded comparison - use python output file
  const deep = JSON.parse(
    readFileSync(join(root, "reports/manual_xlsx_analysis.json"), "utf8"),
  ) as { mayo_last_5_days_sample?: Record<string, ExcelDay[]> };
  // Full daily: run inline read from analysis - we'll fetch via second source
  const all = readExcelClientRows(client);
  return all.filter((d) => d.fecha >= MONTH_START && d.fecha <= CUTOFF);
}

/** Minimal xlsx daily parse for one client (reuse JSON if present). */
function readExcelClientRows(client: string): ExcelDay[] {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const reportPath = join(root, "reports/excel_daily_by_client.json");
  try {
    const data = JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, ExcelDay[]>;
    return data[client] ?? [];
  } catch {
    return [];
  }
}

async function fetchCohort(pipelineId: number) {
  const { from, to } = toUnixRange(MONTH_START, CUTOFF);
  const all: Array<{ id: number; status_id?: number }> = [];
  let page = 1;
  while (true) {
    const data = await kommoGet<{ _embedded?: { leads?: typeof all } }>("/leads", {
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

async function loadEvents(client: string, leadIds: number[]): Promise<KommoEvent[]> {
  const supabase = getSupabaseAdmin()!;
  const out: KommoEvent[] = [];
  const chunk = 300;
  for (let i = 0; i < leadIds.length; i += chunk) {
    const ids = leadIds.slice(i, i + chunk);
    const { data } = await supabase
      .from("kommo_lead_events")
      .select(
        "kommo_lead_id, event_date, status_id, stage_name, pipeline_id, mql, sql, citas, conversations, kommo_event_id",
      )
      .eq("client", client)
      .in("kommo_lead_id", ids)
      .lte("event_date", CUTOFF)
      .not("kommo_event_id", "is", null)
      .order("event_date", { ascending: true });
    for (const r of data ?? []) {
      out.push({
        kommo_lead_id: r.kommo_lead_id as number,
        event_date: r.event_date as string,
        status_id: r.status_id as number | null,
        stage_name: r.stage_name as string | null,
        pipeline_id: r.pipeline_id as number | null,
        mql: (r.mql as number) ?? 0,
        sql: (r.sql as number) ?? 0,
        citas: (r.citas as number) ?? 0,
        conversations: (r.conversations as number) ?? 0,
      });
    }
  }
  return out;
}

function maxRankUpTo(
  events: KommoEvent[],
  untilDate: string,
  statusName: Map<string, string>,
  pipelineId: number,
): Map<number, number> {
  const byLead = new Map<number, number>();
  for (const ev of events) {
    if (ev.event_date > untilDate) continue;
    const tier = tierFromStatus(ev.status_id, ev.stage_name, statusName, pipelineId, ev.pipeline_id);
    if (tier === "firmado") continue;
    const rank = TIER_RANK[tier];
    const id = ev.kommo_lead_id;
    byLead.set(id, Math.max(byLead.get(id) ?? -2, rank));
  }
  return byLead;
}

function countByMaxRank(maxMap: Map<number, number>, minRank: number): number {
  let n = 0;
  for (const max of maxMap.values()) {
    if (max >= minRank) n += 1;
  }
  return n;
}

async function main() {
  const clientArg = process.argv[2]?.replace(/_/g, " ") ?? "DOS HOGARES";
  const client = clientArg.toUpperCase();
  const pipelineId = Number(
    Object.entries(getKommoClientMap()).find(([, c]) => c === client)?.[0] ?? 0,
  );
  if (!pipelineId) {
    console.error("Cliente no encontrado en KOMMO_CLIENT_MAP:", client);
    process.exit(1);
  }

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

  const cohort = await fetchCohort(pipelineId);
  const cohortIds = cohort.map((l) => l.id);
  const events = await loadEvents(client, cohortIds);
  let excelDays = loadExcelDaily(client);
  if (excelDays.length === 0) {
    console.log("Generando excel_daily_by_client.json via Python...");
    const { execSync } = await import("child_process");
    execSync("python scripts/export-excel-daily-json.py", { stdio: "inherit", cwd: join(dirname(fileURLToPath(import.meta.url)), "..") });
    excelDays = loadExcelDaily(client);
  }

  const excelSum = excelDays.reduce(
    (a, d) => ({
      conv: a.conv + d.conv,
      mql: a.mql + d.mql,
      sql: a.sql + d.sql,
      citas: a.citas + d.citas,
      firmas: a.firmas + d.firmas,
    }),
    { conv: 0, mql: 0, sql: 0, citas: 0, firmas: 0 },
  );

  // --- Metricas al corte (inventario / max historico) ---
  const maxAtCutoff = maxRankUpTo(events, CUTOFF, statusName, pipelineId);
  let snapshotMql = 0;
  let snapshotSql = 0;
  let snapshotCita = 0;
  for (const lead of cohort) {
    const tier = tierFromStatus(lead.status_id ?? null, null, statusName, pipelineId);
    if (tier === "firmado") continue;
    if (tierReachedMql(tier)) snapshotMql += 1;
    if (tierReachedSql(tier)) snapshotSql += 1;
    if (tierReachedCita(tier)) snapshotCita += 1;
  }

  const maxMql = countByMaxRank(maxAtCutoff, TIER_RANK.mql);
  const maxSql = countByMaxRank(maxAtCutoff, TIER_RANK.sql);
  const maxCita = countByMaxRank(maxAtCutoff, TIER_RANK.cita);

  console.log(`\n=== ${client} | cohorte ${MONTH_START} -> ${CUTOFF} ===`);
  console.log(`Leads cohorte (API created_at): ${cohortIds.length}`);
  console.log(`Eventos timeline en BD: ${events.length}`);
  console.log(`Filas Excel en rango: ${excelDays.length}\n`);

  console.log("--- A) CORTE 26/05: Excel SUMA diaria vs Kommo ---");
  console.log(`                    | Excel(sum diario) | Kommo`);
  console.log(`CONVERSACIONES      | ${String(excelSum.conv).padStart(17)} | cohorte=${cohortIds.length} (inventario, no suma)`);
  console.log(`MQL                 | ${String(excelSum.mql).padStart(17)} | maxTier>=MQL=${maxMql} | snapshot=${snapshotMql}`);
  console.log(`SQL                 | ${String(excelSum.sql).padStart(17)} | maxTier>=SQL=${maxSql} | snapshot=${snapshotSql}`);
  console.log(`CITAS               | ${String(excelSum.citas).padStart(17)} | maxTier>=CITA=${maxCita} | snapshot=${snapshotCita}`);

  // --- Definiciones diarias ---
  type DayCalc = {
    transitionsMqlPlus: number;
    transitionsSqlPlus: number;
    transitionsCitaPlus: number;
    distinctLeadsMqlEvent: number;
    sumMqlFlags: number;
    sumConvFlags: number;
    firstReachMqlOnDay: number;
    stockMaxMqlEod: number;
  };

  const dates = [...new Set(excelDays.map((d) => d.fecha))].sort();

  let dayMatchTransitions = 0;
  let dayMatchDistinct = 0;
  let dayMatchSumFlags = 0;
  let dayMatchFirstReach = 0;
  let dayTotal = 0;

  function dayBefore(iso: string): string {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  /** Eventos ese dia donde el lead entra a tier estrictamente mayor que el max previo. */
  function countTierEntriesOnDay(fecha: string, minRank: number): number {
    const prevMax = maxRankUpTo(events, dayBefore(fecha), statusName, pipelineId);
    const byLead = events.filter((e) => e.event_date === fecha);
    let n = 0;
    for (const ev of byLead) {
      const tier = tierFromStatus(ev.status_id, ev.stage_name, statusName, pipelineId, ev.pipeline_id);
      if (tier === "firmado") continue;
      const rank = TIER_RANK[tier];
      const prev = prevMax.get(ev.kommo_lead_id) ?? -2;
      if (rank >= minRank && rank > prev) n += 1;
    }
    return n;
  }

  console.log("\n--- B) DIA A DIA: que formula explica el Excel? ---");
  console.log("fecha       | exMQL | entMQL | distMQL | sumFlag | 1stMax | stockMQL");
  console.log("------------|-------|--------|---------|---------|--------|----------");

  for (const fecha of dates) {
    const ex = excelDays.find((d) => d.fecha === fecha);
    if (!ex) continue;
    dayTotal += 1;

    const dayEvents = events.filter((e) => e.event_date === fecha);
    const maxEod = maxRankUpTo(events, fecha, statusName, pipelineId);
    const maxPrev = maxRankUpTo(events, dayBefore(fecha), statusName, pipelineId);

    const enterMqlPlus = countTierEntriesOnDay(fecha, TIER_RANK.mql);
    const distinctMql = new Set<number>();
    let sumMqlFlags = 0;
    let firstReachMqlOnDay = 0;

    for (const ev of dayEvents) {
      const tier = tierFromStatus(ev.status_id, ev.stage_name, statusName, pipelineId, ev.pipeline_id);
      if (tierReachedMql(tier)) distinctMql.add(ev.kommo_lead_id);
      sumMqlFlags += ev.mql;
    }

    for (const id of cohortIds) {
      const prev = maxPrev.get(id) ?? -2;
      const eod = maxEod.get(id) ?? -2;
      if (prev < TIER_RANK.mql && eod >= TIER_RANK.mql) firstReachMqlOnDay += 1;
    }

    const stockMaxMqlEod = countByMaxRank(maxEod, TIER_RANK.mql);
    const mql = Math.round(ex.mql);
    if (mql === enterMqlPlus) dayMatchTransitions += 1;
    if (mql === distinctMql.size) dayMatchDistinct += 1;
    if (mql === sumMqlFlags) dayMatchSumFlags += 1;
    if (mql === firstReachMqlOnDay) dayMatchFirstReach += 1;

    console.log(
      `${fecha} | ${String(mql).padStart(5)} | ${String(enterMqlPlus).padStart(6)} | ${String(distinctMql.size).padStart(7)} | ${String(sumMqlFlags).padStart(7)} | ${String(firstReachMqlOnDay).padStart(6)} | ${String(stockMaxMqlEod).padStart(8)}`,
    );
  }

  console.log(
    `\nDias match MQL: enterTier=${dayMatchTransitions}/${dayTotal} distinct=${dayMatchDistinct}/${dayTotal} sumFlags=${dayMatchSumFlags}/${dayTotal} firstMaxCross=${dayMatchFirstReach}/${dayTotal}`,
  );

  // --- C) Nueva entrada conversacion ese dia ---
  let dayMatchNewConv = 0;
  console.log("\n--- C) CONVERSACIONES diarias: nuevos en cohorte vs Excel ---");
  console.log("fecha       | exConv | eventos | leadsCreated");
  for (const fecha of dates) {
    const ex = excelDays.find((d) => d.fecha === fecha);
    if (!ex) continue;
    const evCount = events.filter((e) => e.event_date === fecha).length;
    const created = cohort.filter(() => false).length; // placeholder
    void created;
    const dayEv = events.filter((e) => e.event_date === fecha).length;
    const distinctLeads = new Set(events.filter((e) => e.event_date === fecha).map((e) => e.kommo_lead_id)).size;
    const match = Math.round(ex.conv) === distinctLeads ? 1 : 0;
    dayMatchNewConv += match;
    if (dates.indexOf(fecha) < 8 || fecha >= "2026-05-20") {
      console.log(`${fecha} | ${String(Math.round(ex.conv)).padStart(6)} | ${String(dayEv).padStart(7)} | ${String(distinctLeads).padStart(12)}`);
    }
  }
  console.log(`Match conv=distinctLeadsConEvento: ${dayMatchNewConv}/${dayTotal}`);

  console.log("\n--- D) CONCLUSION ---");
  const scores = [
    { name: "entrada tier>=MQL (sube max)", n: dayMatchTransitions },
    { name: "distinct leads evento MQL+", n: dayMatchDistinct },
    { name: "suma flags mql", n: dayMatchSumFlags },
    { name: "primera vez max cruza MQL", n: dayMatchFirstReach },
  ].sort((a, b) => b.n - a.n);
  const mqlBest = scores[0]!.name;
  console.log(`MQL diario Excel se parece mas a: ${mqlBest}`);
  console.log(
    `Al corte: Excel suma MQL=${excelSum.mql} NO es igual a maxTier(${maxMql}) ni snapshot(${snapshotMql}) — son metricas distintas.`,
  );
  console.log(
    `maxTier al ${CUTOFF} es inventario/embudo; Excel MQL diario es flujo/actividad.`,
  );

  // #region agent log
  fetch("http://127.0.0.1:7880/ingest/6fd1d614-7a66-4dcc-a425-d3b833f324c4", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a0037c" },
    body: JSON.stringify({
      sessionId: "a0037c",
      runId: "excel-max-tier",
      hypothesisId: "H-max-vs-excel",
      location: "probe-excel-vs-kommo-max-tier.ts",
      message: "excel vs kommo comparison",
      data: {
        client,
        cohort: cohortIds.length,
        excelSum,
        maxMql,
        maxSql,
        maxCita,
        snapshotMql,
        dayMatchDistinct,
        dayMatchTransitions,
        dayMatchSumFlags,
        dayMatchFirstReach,
        dayTotal,
        mqlBest,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
