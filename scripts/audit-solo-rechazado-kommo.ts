/**
 * Verifica leads con solo evento RECHAZADO en Supabase contra GET /events de Kommo.
 *
 * Uso: node --use-system-ca --import tsx scripts/audit-solo-rechazado-kommo.ts
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { z } from "zod";
import {
  assertAuditReady,
  REPORTS_DIR,
  runFullRejectionAudit,
  writeJsonReport,
} from "./lib/rejectionAuditShared.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { withNetworkRetry } from "../server/lib/retry.js";

const kommoEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  entity_id: z.coerce.number(),
  created_at: z.coerce.number(),
});

const eventsPageSchema = z.object({
  _embedded: z.object({ events: z.array(kommoEventSchema).optional() }).optional(),
});

type AuditResult = "CONFIRMADO" | "EVENTO_FALTANTE" | "ERROR_API";

function ddMmYyyyToUnix(fecha: string | null): number | null {
  if (!fecha) return null;
  const m = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return Math.floor(new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`).getTime() / 1000);
}

async function fetchKommoEventsForLead(
  leadId: number,
  fromUnix: number,
  toUnix: number,
): Promise<{ events: z.infer<typeof kommoEventSchema>[]; error: string | null }> {
  const all: z.infer<typeof kommoEventSchema>[] = [];
  try {
    for (let page = 1; page <= 20; page += 1) {
      const data = await withNetworkRetry(`Kommo events lead ${leadId} p${page}`, async () =>
        kommoGet<unknown>("/events", {
          params: {
            page,
            limit: 250,
            "filter[type]": "lead_status_changed",
            "filter[entity]": "lead",
            "filter[entity_id]": leadId,
            "filter[created_at][from]": fromUnix,
            "filter[created_at][to]": toUnix,
          },
          timeout: 120_000,
        }),
      );
      const parsed = eventsPageSchema.safeParse(data);
      const batch = parsed.success ? (parsed.data._embedded?.events ?? []) : [];
      all.push(...batch);
      if (!batch.length || batch.length < 250) break;
    }
    return { events: all, error: null };
  } catch (err) {
    return { events: [], error: err instanceof Error ? err.message : String(err) };
  }
}

async function main(): Promise<void> {
  assertAuditReady();

  const auditPath = join(REPORTS_DIR, "rejection-audit-ene-jun-2026.json");
  let soloLeads: Array<{ id: number; client: string; name: string; created_at: number | null }>;

  if (existsSync(auditPath)) {
    const raw = JSON.parse(readFileSync(auditPath, "utf8")) as {
      all_records: Array<{
        id: number;
        client: string;
        name: string;
        solo_rechazado: boolean;
        fecha_creacion: string | null;
      }>;
    };
    soloLeads = raw.all_records
      .filter((r) => r.solo_rechazado)
      .map((r) => ({
        id: r.id,
        client: r.client,
        name: r.name,
        created_at: ddMmYyyyToUnix(r.fecha_creacion),
      }));
    console.log(`Cargados ${soloLeads.length} solo-RECHAZADO desde JSON existente`);
  } else {
    const { records } = await runFullRejectionAudit();
    soloLeads = records
      .filter((r) => r.solo_rechazado)
      .map((r) => ({ id: r.id, client: r.client, name: r.name, created_at: null }));
  }

  const toUnix = Math.floor(Date.now() / 1000);
  const results: Array<{
    id: number;
    client: string;
    name: string;
    supabase_events: number;
    kommo_events: number;
    result: AuditResult;
    note: string;
  }> = [];

  let confirmed = 0;
  let missing = 0;
  let errors = 0;

  const limit = process.env.KOMMO_SOLO_REJ_LIMIT
    ? Number(process.env.KOMMO_SOLO_REJ_LIMIT)
    : soloLeads.length;
  const toProcess = soloLeads.slice(0, limit);
  if (limit < soloLeads.length) {
    console.log(`Limitado a ${limit} de ${soloLeads.length} (KOMMO_SOLO_REJ_LIMIT)`);
  }

  console.log(`\nVerificando ${toProcess.length} leads contra API Kommo…\n`);

  for (let i = 0; i < toProcess.length; i += 1) {
    const lead = toProcess[i]!;
    if (i > 0 && i % 25 === 0) {
      console.log(`  progreso ${i}/${toProcess.length}…`);
      writeJsonReport("solo-rechazado-kommo-audit.partial.json", {
        progress: i,
        total: toProcess.length,
        results,
      });
    }

    const fromUnix = lead.created_at
      ? lead.created_at - 86400
      : Math.floor(new Date("2026-01-01T00:00:00").getTime() / 1000);

    const { events, error } = await fetchKommoEventsForLead(lead.id, fromUnix, toUnix);

    let result: AuditResult;
    let note: string;

    if (error) {
      result = "ERROR_API";
      note = error;
      errors += 1;
    } else if (events.length <= 1) {
      result = "CONFIRMADO";
      note = "Kommo no registra transiciones adicionales";
      confirmed += 1;
    } else {
      result = "EVENTO_FALTANTE";
      note = `Kommo tiene ${events.length} eventos; Supabase solo RECHAZADO`;
      missing += 1;
    }

    results.push({
      id: lead.id,
      client: lead.client,
      name: lead.name,
      supabase_events: 1,
      kommo_events: events.length,
      result,
      note,
    });
  }

  const summary = {
    generated_at: new Date().toISOString(),
    total: toProcess.length,
    total_cohort: soloLeads.length,
    confirmed,
    evento_faltante: missing,
    error_api: errors,
    confirmed_pct: toProcess.length ? Math.round((100 * confirmed) / toProcess.length) : 0,
    by_client: Object.fromEntries(
      [...new Set(soloLeads.map((l) => l.client))].map((c) => [
        c,
        {
          total: results.filter((r) => r.client === c).length,
          confirmed: results.filter((r) => r.client === c && r.result === "CONFIRMADO").length,
          evento_faltante: results.filter((r) => r.client === c && r.result === "EVENTO_FALTANTE")
            .length,
        },
      ]),
    ),
  };

  writeJsonReport("solo-rechazado-kommo-audit.json", { summary, results });
  console.log("\n=== Solo RECHAZADO vs Kommo API ===");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
