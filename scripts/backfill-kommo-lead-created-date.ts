import "../server/config/env.js";
import { isKommoConfigured, isSupabaseConfigured } from "../server/config/env.js";
import { hasLeadCreatedDateColumn } from "../server/lib/dashboardMetricsDb.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";

type LeadRef = { kommo_lead_id: number };
type KommoLead = { id?: number; created_at?: number };

const PAGE = 1000;
const BATCH = 200;

function toIsoDateFromUnix(ts: number | undefined): string | null {
  if (ts == null || !Number.isFinite(ts)) return null;
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

async function fetchLeadCreatedDates(leadIds: number[]): Promise<Map<number, string | null>> {
  const byLead = new Map<number, string | null>();
  if (leadIds.length === 0) return byLead;

  const idsParam = leadIds.map((id) => `filter[id][]=${id}`).join("&");
  const data = await kommoGet<{ _embedded?: { leads?: KommoLead[] } }>(`/leads?${idsParam}`, {
    params: { limit: 250 },
    timeout: 120_000,
  });
  for (const lead of data?._embedded?.leads ?? []) {
    if (typeof lead.id !== "number") continue;
    byLead.set(lead.id, toIsoDateFromUnix(lead.created_at));
  }
  return byLead;
}

async function main(): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error("Supabase no configurado");
  if (!isKommoConfigured()) throw new Error("Kommo no configurado");
  if (!(await hasLeadCreatedDateColumn())) {
    throw new Error("Falta migración 005_lead_created_date.sql");
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase admin no disponible");

  const leadIds = new Set<number>();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("kommo_lead_events")
      .select("kommo_lead_id")
      .is("lead_created_date", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Error leyendo kommo_lead_events: ${error.message}`);
    const rows = (data ?? []) as LeadRef[];
    if (rows.length === 0) break;
    rows.forEach((row) => leadIds.add(row.kommo_lead_id));
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  const ids = Array.from(leadIds);
  console.log(`[backfill-created-date] leads sin created_date: ${ids.length}`);
  if (ids.length === 0) return;

  let updatedEvents = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const createdMap = await fetchLeadCreatedDates(batch);
    for (const leadId of batch) {
      const createdDate = createdMap.get(leadId) ?? null;
      if (!createdDate) continue;
      const { error, count } = await supabase
        .from("kommo_lead_events")
        .update({ lead_created_date: createdDate })
        .eq("kommo_lead_id", leadId)
        .is("lead_created_date", null);
      if (error) throw new Error(`Error actualizando lead ${leadId}: ${error.message}`);
      updatedEvents += count ?? 0;
    }
    console.log(`[backfill-created-date] batch ${Math.min(i + BATCH, ids.length)}/${ids.length}`);
  }

  console.log(`[backfill-created-date] eventos actualizados: ${updatedEvents}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
