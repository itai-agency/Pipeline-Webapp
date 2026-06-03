/**
 * Verifica moldeado diario (kommoDailyMold) vs Excel.
 * npx tsx scripts/verify-mold-vs-excel.ts DOS_HOGARES
 */
import "../server/config/env.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { moldDailyMetricsFromTimeline, type TimelineEventRow, type LeadCohortMeta } from "../server/lib/kommoDailyMold.js";
import { getKommoClientMap, isKommoConfigured } from "../server/config/env.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";
import { fetchKommoStatuses, fetchKommoLeadsPageByPipelineCreated } from "../server/services/kommo.service.js";

const MONTH_START = "2026-05-01";
const CUTOFF = "2026-05-26";

function score(excel: Array<{ fecha: string; conv: number; mql: number; sql: number; citas: number }>, mold: Map<string, { conversaciones: number; mql: number; sql: number; citas: number; date: string }>, field: "conv" | "mql" | "sql" | "citas") {
  const keyMap = { conv: "conversaciones", mql: "mql", sql: "sql", citas: "citas" } as const;
  const k = keyMap[field];
  let exact = 0;
  let mae = 0;
  for (const row of excel) {
    const m = mold.get(`${row.fecha}::`) ?? [...mold.values()].find((v) => v.date === row.fecha);
    const mv = m ? (m as Record<string, number>)[k] : 0;
    const ev = Math.round(field === "conv" ? row.conv : field === "mql" ? row.mql : field === "sql" ? row.sql : row.citas);
    const kv = Math.round(mv ?? 0);
    if (kv === ev) exact += 1;
    mae += Math.abs(kv - ev);
  }
  return { exact, mae, total: excel.length };
}

async function main() {
  const client = (process.argv[2] ?? "DOS HOGARES").replace(/_/g, " ").toUpperCase();
  const pid = Number(Object.entries(getKommoClientMap()).find(([, c]) => c === client)?.[0]);
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const excel = (JSON.parse(readFileSync(join(root, "reports/excel_daily_by_client.json"), "utf8")) as Record<
    string,
    Array<{ fecha: string; conv: number; mql: number; sql: number; citas: number }>
  >)[client]!.filter((d) => d.fecha >= MONTH_START && d.fecha <= CUTOFF);

  const statuses = await fetchKommoStatuses();
  const statusNameByKey = new Map<string, string>();
  for (const s of statuses) {
    if (s.pipeline_id != null) statusNameByKey.set(`${s.pipeline_id}:${s.id}`, s.name);
    statusNameByKey.set(String(s.id), s.name);
  }

  const leadCohort = new Map<number, LeadCohortMeta>();
  if (isKommoConfigured()) {
    let page = 1;
    while (true) {
      const leads = await fetchKommoLeadsPageByPipelineCreated(page, pid, MONTH_START, CUTOFF);
      if (!leads.length) break;
      for (const l of leads) {
        const cd = l.created_at ? new Date(l.created_at * 1000).toISOString().slice(0, 10) : MONTH_START;
        leadCohort.set(l.id, { client, createdDate: cd });
      }
      if (leads.length < 250) break;
      page += 1;
    }
  }

  const supabase = getSupabaseAdmin()!;
  const events: TimelineEventRow[] = [];
  const ids = [...leadCohort.keys()];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from("kommo_lead_events")
      .select("kommo_lead_id, event_date, client, pipeline_id, status_id, stage_name, lead_created_date, raw_payload")
      .eq("client", client)
      .in("kommo_lead_id", ids.slice(i, i + 200))
      .gte("event_date", MONTH_START)
      .lte("event_date", CUTOFF)
      .not("kommo_event_id", "is", null);
    for (const r of data ?? []) {
      events.push({
        kommo_lead_id: r.kommo_lead_id as number,
        event_date: r.event_date as string,
        client: r.client as string,
        pipeline_id: r.pipeline_id as number | null,
        status_id: r.status_id as number | null,
        stage_name: r.stage_name as string | null,
        lead_created_date: r.lead_created_date as string | null,
        raw_payload: r.raw_payload,
      });
    }
  }

  const mold = moldDailyMetricsFromTimeline(
    events,
    leadCohort,
    statusNameByKey,
    new Map([[client, pid]]),
    { monthStart: MONTH_START, monthEnd: CUTOFF },
  );

  const moldByDate = new Map<string, (typeof mold extends Map<string, infer V> ? V : never)>();
  for (const row of mold.values()) moldByDate.set(row.date, row);

  console.log(`\n=== Moldeado vs Excel: ${client} ===\n`);
  console.log("fecha       | exC | kmC | exM | kmM | exS | kmS | exCi| kmCi");
  for (const ex of excel) {
    const m = moldByDate.get(ex.fecha);
    const mark = (a: number, b: number) => (a === b ? " " : "*");
    console.log(
      `${ex.fecha} | ${String(Math.round(ex.conv)).padStart(3)}${mark(Math.round(ex.conv), m?.conversaciones ?? 0)}${String(m?.conversaciones ?? 0).padStart(3)} | ${String(Math.round(ex.mql)).padStart(3)}${mark(Math.round(ex.mql), m?.mql ?? 0)}${String(m?.mql ?? 0).padStart(3)} | ${String(Math.round(ex.sql)).padStart(3)}${mark(Math.round(ex.sql), m?.sql ?? 0)}${String(m?.sql ?? 0).padStart(3)} | ${String(Math.round(ex.citas)).padStart(3)}${mark(Math.round(ex.citas), m?.citas ?? 0)}${String(m?.citas ?? 0).padStart(3)}`,
    );
  }

  const sc = (f: "conv" | "mql" | "sql" | "citas") => {
    let exact = 0;
    let mae = 0;
    for (const ex of excel) {
      const m = moldByDate.get(ex.fecha);
      const kv =
        f === "conv" ? m?.conversaciones ?? 0 : f === "mql" ? m?.mql ?? 0 : f === "sql" ? m?.sql ?? 0 : m?.citas ?? 0;
      const ev = f === "conv" ? ex.conv : f === "mql" ? ex.mql : f === "sql" ? ex.sql : ex.citas;
      if (Math.round(kv) === Math.round(ev)) exact += 1;
      mae += Math.abs(Math.round(kv) - Math.round(ev));
    }
    return { exact, mae };
  };

  const c = sc("conv");
  const m = sc("mql");
  const s = sc("sql");
  const ci = sc("citas");
    console.log(`\nMatch exacto: CONV(Kommo created_at) ${c.exact}/22 MAE=${c.mae} | MQL ${m.exact}/22 | SQL ${s.exact}/22 | CITAS ${ci.exact}/22`);
    console.log("Nota: tras sync Meta, CONVERSACIONES en BD = leads Meta Insights (npm run sync:meta).");
}

main().catch(console.error);
