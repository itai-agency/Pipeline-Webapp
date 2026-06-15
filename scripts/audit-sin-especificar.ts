/**
 * Auditoría del bucket "Sin especificar": API vs PDF, por pipeline.
 *
 * Uso: node --use-system-ca --import tsx scripts/audit-sin-especificar.ts
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join as pathJoin } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
import {
  assertAuditReady,
  REPORTS_DIR,
  runFullRejectionAudit,
  writeJsonReport,
  type LeadAuditRecord,
} from "./lib/rejectionAuditShared.js";

const PDF_PATH =
  process.env.KOMMO_AUDIT_PDF ??
  "c:\\Users\\calec\\Downloads\\Auditoria_Kommo_Ene-Jun2026-1 completo.pdf";

type PdfRechazado = { id: number; motivo: string; client_hint?: string };

function parsePdfSinEspecificar(): PdfRechazado[] {
  try {
    const script = pathJoin(__dirname, "_parse_pdf_sin_especificar.py");
    const out = execSync(`python "${script}" "${PDF_PATH}"`, {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
    return JSON.parse(out.trim()) as PdfRechazado[];
  } catch (err) {
    console.warn("No se pudo parsear PDF:", err instanceof Error ? err.message : err);
    return [];
  }
}

function pickSamples(records: LeadAuditRecord[], perClient = 5): Record<string, unknown[]> {
  const clients = [...new Set(records.map((r) => r.client))].sort();
  const out: Record<string, unknown[]> = {};
  for (const client of clients) {
    out[client] = records
      .filter((r) => r.client === client)
      .slice(0, perClient)
      .map((r) => ({
        id: r.id,
        name: r.name,
        fecha_creacion: r.fecha_creacion,
        fecha_rechazo: r.fecha_rechazo,
        etapa: "RECHAZADO",
        motivo: "sin especificar",
        timeline_event_count: r.timeline_event_count,
        solo_rechazado: r.solo_rechazado,
      }));
  }
  return out;
}

async function main(): Promise<void> {
  assertAuditReady();

  const auditPath = join(REPORTS_DIR, "rejection-audit-ene-jun-2026.json");
  let records: LeadAuditRecord[];
  let totalRejected: number;

  if (existsSync(auditPath)) {
    const raw = JSON.parse(readFileSync(auditPath, "utf8")) as {
      all_records: LeadAuditRecord[];
      summary: { totals: { rejected: number } };
    };
    records = raw.all_records;
    totalRejected = raw.summary.totals.rejected;
    console.log(`Cargados ${records.length} registros desde JSON existente`);
  } else {
    const audit = await runFullRejectionAudit();
    records = audit.records;
    totalRejected = audit.records.length;
  }

  const sinEspec = records.filter((r) => r.bucket.includes("sin_especificar"));
  const pdfSinEspec = parsePdfSinEspecificar();
  const apiIds = new Set(sinEspec.map((r) => r.id));
  const pdfIds = new Set(pdfSinEspec.map((r) => r.id));
  const recordsById = new Map(records.map((r) => [r.id, r]));

  /** Muestras API (loss_reason_id nulo) */
  const samplesApi = pickSamples(sinEspec, 5);

  /** Muestras PDF (1.924 ref.) — 5 por client_hint o client resuelto */
  const pdfByClient: Record<string, LeadAuditRecord[]> = {};
  for (const p of pdfSinEspec) {
    const rec = recordsById.get(p.id);
    const client = rec?.client ?? p.client_hint ?? "DESCONOCIDO";
    pdfByClient[client] ??= [];
    if (rec) pdfByClient[client].push(rec);
    else if (pdfByClient[client].length < 5) {
      pdfByClient[client].push({
        id: p.id,
        name: `Lead #${p.id}`,
        client,
        pipeline_id: 0,
        motivo: null,
        motivo_tier: "unknown",
        timeline_max_tier: "sin_eventos",
        timeline_max_rank: -2,
        timeline_event_count: 0,
        solo_rechazado: false,
        fecha_rechazo: null,
        fecha_creacion: null,
        bucket: ["sin_especificar"],
      });
    }
  }
  const samplesPdf: Record<string, unknown[]> = {};
  for (const client of Object.keys(pdfByClient).sort()) {
    samplesPdf[client] = pdfByClient[client].slice(0, 5).map((r) => ({
      id: r.id,
      name: r.name,
      fecha_creacion: r.fecha_creacion,
      fecha_rechazo: r.fecha_rechazo,
      etapa: "RECHAZADO",
      motivo: "sin especificar",
      fuente: "PDF auditoría",
    }));
  }

  const pdfByClientCounts: Record<string, number> = {};
  for (const p of pdfSinEspec) {
    const rec = recordsById.get(p.id);
    const client = rec?.client ?? p.client_hint ?? "DESCONOCIDO";
    pdfByClientCounts[client] = (pdfByClientCounts[client] ?? 0) + 1;
  }

  const byClient: Record<
    string,
    {
      sin_especificar: number;
      total_rechazados: number;
      pct: number;
      solo_rechazado: number;
      con_timeline_parcial: number;
    }
  > = {};

  for (const client of [...new Set(records.map((r) => r.client))].sort()) {
    const clientRej = records.filter((r) => r.client === client);
    const clientSin = sinEspec.filter((r) => r.client === client);
    byClient[client] = {
      sin_especificar: clientSin.length,
      total_rechazados: clientRej.length,
      pct: clientRej.length ? Math.round((100 * clientSin.length) / clientRej.length) : 0,
      solo_rechazado: clientSin.filter((r) => r.solo_rechazado).length,
      con_timeline_parcial: clientSin.filter((r) => !r.solo_rechazado).length,
    };
  }

  const summary = {
    generated_at: new Date().toISOString(),
    api: {
      total_rechazados: totalRejected,
      sin_especificar: sinEspec.length,
      pct: totalRejected ? Math.round((100 * sinEspec.length) / totalRejected) : 0,
    },
    pdf: {
      sin_especificar: pdfSinEspec.length,
      path: PDF_PATH,
    },
    cross_ref: {
      in_both: [...apiIds].filter((id) => pdfIds.has(id)).length,
      api_only: [...apiIds].filter((id) => !pdfIds.has(id)).length,
      pdf_only: [...pdfIds].filter((id) => !apiIds.has(id)).length,
    },
    by_client: byClient,
    pdf_by_client: pdfByClientCounts,
    samples_per_client: samplesApi,
    pdf_samples_per_client: samplesPdf,
  };

  writeJsonReport("sin-especificar-audit.json", summary);
  console.log("\n=== Sin especificar ===");
  console.log(JSON.stringify(summary.api, null, 2));
  console.log("PDF:", summary.pdf.sin_especificar);
  console.log("Cross-ref:", summary.cross_ref);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
