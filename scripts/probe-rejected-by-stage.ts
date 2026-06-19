/**
 * Probe: cobertura de "rechazados por etapa máxima alcanzada" usando SOLO Supabase
 * (kommo_lead_events), clasificando por stage_name sin llamar a la API de Kommo.
 *
 * Valida el enfoque para el badge del dashboard antes de implementarlo en el servicio.
 */
import "../server/config/env.js";
import { getAllowedDashboardClients } from "../server/config/env.js";
import {
  classifyKommoStageTier,
  type KommoStageTier,
} from "../server/config/kommoStageMap.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";
import {
  computeMaxPreRejectTier,
  type TimelineRow,
} from "./lib/rejectionAuditShared.js";

const VISIBLE_TIERS: KommoStageTier[] = ["mql", "sql", "cita", "firmado"];

async function main(): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    console.error("Supabase no configurado");
    process.exit(1);
  }

  const allowed = Array.from(getAllowedDashboardClients());
  console.log("Clientes:", allowed.join(", "));

  // Cargar todos los eventos por cliente (paginado), agrupar por lead.
  const byLead = new Map<number, { client: string; events: TimelineRow[] }>();
  let offset = 0;
  const page = 1000;
  let total = 0;
  while (true) {
    const { data, error } = await sb
      .from("kommo_lead_events")
      .select("kommo_lead_id, client, status_id, event_date, stage_name, raw_payload")
      .in("client", allowed)
      .order("event_date", { ascending: true })
      .range(offset, offset + page - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    total += data.length;
    for (const row of data) {
      const id = row.kommo_lead_id as number;
      const entry = byLead.get(id) ?? { client: row.client as string, events: [] };
      entry.events.push({
        kommo_lead_id: id,
        status_id: row.status_id as number | null,
        event_date: row.event_date as string,
        stage_name: row.stage_name as string | null,
        raw_payload: row.raw_payload as TimelineRow["raw_payload"],
      });
      byLead.set(id, entry);
    }
    if (data.length < page) break;
    offset += page;
  }
  console.log(`Eventos: ${total} | Leads únicos: ${byLead.size}`);

  // statusTier vacío → forzar clasificación por stage_name (enfoque solo-Supabase).
  const emptyStatusTier = new Map<number, KommoStageTier>();

  const hasRejectEvent = (events: TimelineRow[]): boolean =>
    events.some((e) => classifyKommoStageTier(e.stage_name ?? "") === "rejected");

  let rejectedLeads = 0;
  const byTier: Record<string, number> = {};
  const byClientTier: Record<string, Record<string, number>> = {};
  let soloRechazado = 0;
  let sinEtapaPrevia = 0;

  for (const [, { client, events }] of byLead) {
    if (!hasRejectEvent(events)) continue;
    rejectedLeads += 1;
    const { maxTier, soloRechazado: solo } = computeMaxPreRejectTier(events, emptyStatusTier);
    if (solo) soloRechazado += 1;
    if (maxTier === "sin_eventos") {
      sinEtapaPrevia += 1;
      continue;
    }
    byTier[maxTier] = (byTier[maxTier] ?? 0) + 1;
    byClientTier[client] = byClientTier[client] ?? {};
    byClientTier[client][maxTier] = (byClientTier[client][maxTier] ?? 0) + 1;
  }

  console.log(`\n=== Rechazados (tienen evento de rechazo en timeline): ${rejectedLeads} ===`);
  console.log("solo_rechazado (nunca avanzó):", soloRechazado);
  console.log("sin etapa previa registrada (maxTier=sin_eventos):", sinEtapaPrevia);
  console.log("\nPor etapa máxima alcanzada (todas):");
  console.log(byTier);
  console.log("\nVisibles en dashboard (mql/sql/cita/firmado):");
  for (const t of VISIBLE_TIERS) console.log(`  ${t}: ${byTier[t] ?? 0}`);
  console.log("\nPor cliente:");
  for (const [client, tiers] of Object.entries(byClientTier).sort()) {
    console.log(`  ${client}:`, tiers);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
