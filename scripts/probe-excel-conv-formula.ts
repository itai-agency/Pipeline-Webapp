/**
 * Busca formula de CONVERSACIONES diarias vs Excel (transiciones + nuevos leads).
 */
import "../server/config/env.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { getKommoClientMap } from "../server/config/env.js";
import { classifyKommoStageTier, type KommoStageTier } from "../server/config/kommoStageMap.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";

const MONTH_START = "2026-05-01";
const CUTOFF = "2026-05-26";

const leadStatusChangeSchema = z.object({
  lead_status: z.object({ id: z.coerce.number(), pipeline_id: z.coerce.number() }),
});

function parseStatus(arr: Array<Record<string, unknown>> | undefined) {
  if (!arr?.length) return null;
  const p = leadStatusChangeSchema.safeParse(arr[0]);
  return p.success ? p.data.lead_status : null;
}

async function probe(client: string) {
  const pid = Number(Object.entries(getKommoClientMap()).find(([, c]) => c === client)?.[0]);
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const excel = (JSON.parse(readFileSync(join(root, "reports/excel_daily_by_client.json"), "utf8")) as Record<
    string,
    Array<{ fecha: string; conv: number }>
  >)[client]!.filter((d) => d.fecha >= MONTH_START && d.fecha <= CUTOFF);

  type PipelinesResponse = {
    _embedded?: { pipelines?: Array<{ id: number; _embedded?: { statuses?: Array<{ id: number; name: string }> } }> };
  };
  const pipes = await kommoGet<PipelinesResponse>("/leads/pipelines");
  const statusName = new Map<string, string>();
  for (const p of pipes._embedded?.pipelines ?? []) {
    for (const s of p._embedded?.statuses ?? []) {
      statusName.set(`${p.id}:${s.id}`, s.name);
    }
  }
  const tier = (sid: number, pip: number) =>
    classifyKommoStageTier(statusName.get(`${pip}:${sid}`) ?? "");

  const from = Math.floor(new Date(`${MONTH_START}T00:00:00`).getTime() / 1000);
  const to = Math.floor(new Date(`${CUTOFF}T23:59:59`).getTime() / 1000);
  const created = new Map<number, string>();
  let page = 1;
  while (true) {
    const data = await kommoGet<{ _embedded?: { leads?: Array<{ id: number; created_at?: number }> } }>("/leads", {
      params: { page, limit: 250, "filter[pipeline_id]": pid, "filter[created_at][from]": from, "filter[created_at][to]": to },
    });
    for (const l of data._embedded?.leads ?? []) {
      created.set(l.id, new Date((l.created_at ?? 0) * 1000).toISOString().slice(0, 10));
    }
    if ((data._embedded?.leads?.length ?? 0) < 250) break;
    page += 1;
  }

  const supabase = getSupabaseAdmin()!;
  const ids = [...created.keys()];
  type Ev = { lead: number; date: string; before: KommoStageTier; after: KommoStageTier };
  const events: Ev[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from("kommo_lead_events")
      .select("kommo_lead_id, event_date, raw_payload, kommo_event_id")
      .eq("client", client)
      .in("kommo_lead_id", ids.slice(i, i + 200))
      .lte("event_date", CUTOFF)
      .not("kommo_event_id", "is", null);
    for (const r of data ?? []) {
      const pl = r.raw_payload as { value_after?: unknown[]; value_before?: unknown[] };
      const a = parseStatus(pl?.value_after as Array<Record<string, unknown>>);
      const b = parseStatus(pl?.value_before as Array<Record<string, unknown>>);
      if (!a) continue;
      events.push({
        lead: r.kommo_lead_id as number,
        date: r.event_date as string,
        before: b ? tier(b.id, b.pipeline_id) : tier(a.id, a.pipeline_id),
        after: tier(a.id, a.pipeline_id),
      });
    }
  }

  const dates = [...new Set(excel.map((e) => e.fecha))];
  const formulas: Record<string, Record<string, number>> = {
    newLeads: {},
    enterEntrada: {},
    leaveRejectedToActive: {},
    anyTransition: {},
    newPlusEnterEntrada: {},
    newPlusLeaveRejected: {},
    distinctActive: {},
  };
  for (const d of dates) {
    formulas.newLeads[d] = 0;
    formulas.enterEntrada[d] = 0;
    formulas.leaveRejectedToActive[d] = 0;
    formulas.anyTransition[d] = 0;
    formulas.newPlusEnterEntrada[d] = 0;
    formulas.newPlusLeaveRejected[d] = 0;
    formulas.distinctActive[d] = 0;
  }

  for (const [id, cd] of created) {
    if (cd >= MONTH_START && cd <= CUTOFF) formulas.newLeads[cd]! += 1;
  }
  const distinct = new Map<string, Set<number>>();
  for (const ev of events) {
    formulas.anyTransition[ev.date]! += 1;
    if (ev.after === "entrada" && ev.before !== "entrada") formulas.enterEntrada[ev.date]! += 1;
    if (ev.before === "rejected" && ev.after !== "rejected") formulas.leaveRejectedToActive[ev.date]! += 1;
    if (ev.after !== "rejected" && ev.after !== "firmado") {
      const s = distinct.get(ev.date) ?? new Set();
      s.add(ev.lead);
      distinct.set(ev.date, s);
    }
  }
  for (const d of dates) {
    formulas.newPlusEnterEntrada[d] = formulas.newLeads[d]! + formulas.enterEntrada[d]!;
    formulas.newPlusLeaveRejected[d] = formulas.newLeads[d]! + formulas.leaveRejectedToActive[d]!;
    formulas.distinctActive[d] = distinct.get(d)?.size ?? 0;
  }

  console.log(`\n=== ${client} CONVERSACIONES ===`);
  for (const [name, vals] of Object.entries(formulas)) {
    let exact = 0;
    let mae = 0;
    for (const row of excel) {
      const k = Math.round(vals[row.fecha] ?? 0);
      const e = Math.round(row.conv);
      if (k === e) exact += 1;
      mae += Math.abs(k - e);
    }
    console.log(`  ${name.padEnd(22)} exact=${exact}/22 MAE=${mae}`);
  }
}

const clients = process.argv[2] ? [process.argv[2].replace(/_/g, " ")] : ["DOS HOGARES", "INSPIRA", "HOGARES"];
for (const c of clients) await probe(c.toUpperCase());
