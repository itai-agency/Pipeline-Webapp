/**
 * Verifica reached* vs PDF auditoría (no HTML).
 * Uso: node --use-system-ca --import tsx scripts/verify-reached-enrich.ts [since] [until]
 */
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "../server/config/env.js";
import { isKommoReachedRejectedTimelineEnabled } from "../server/config/env.js";
import { buildKommoMonthlyCohortSnapshots } from "../server/services/kommo.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF_PATH =
  process.env.KOMMO_AUDIT_PDF ??
  "c:\\Users\\calec\\Downloads\\Auditoria_Kommo_Ene-Jun2026-1 completo.pdf";

const since = process.argv[2] ?? "2026-05-01";
const until = process.argv[3] ?? "2026-05-31";
const monthKey = since.slice(0, 7);

type PdfMonthly = {
  monthly: Record<string, Record<string, { total: number; activos: number; rechazados: number }>>;
};

function loadPdfMonth(): PdfMonthly {
  const script = join(__dirname, "_parse_pdf_audit_monthly.py");
  const out = execSync(`python "${script}" "${PDF_PATH}"`, { encoding: "utf8" });
  return JSON.parse(out) as PdfMonthly;
}

const pdf = loadPdfMonth();

console.log(
  `Modo reached: ${isKommoReachedRejectedTimelineEnabled() ? "timeline (activos+rechazados)" : "gregorio_gated (rollback)"}`,
);
console.log(`Referencia: PDF auditoría · mes ${monthKey}\n`);

const snaps = await buildKommoMonthlyCohortSnapshots(since, until);
let convOk = 0;

for (const s of snaps.sort((a, b) => a.client.localeCompare(b.client))) {
  const ref = pdf.monthly[s.client]?.[monthKey];
  if (!ref) {
    console.log(`${s.client.padEnd(16)} (sin datos PDF para ${monthKey})`);
    continue;
  }
  const dConv = s.leads - ref.total;
  const convMark = Math.abs(dConv) <= 3 ? "✓" : "≠";
  if (Math.abs(dConv) <= 3) convOk += 1;

  console.log(
    `${convMark} ${s.client.padEnd(14)} leads ${s.leads}/${ref.total} (Δ${dConv >= 0 ? "+" : ""}${dConv})  ` +
      `act ${s.leads - s.byTier.rejected - s.byTier.firmado}/${ref.activos}  ` +
      `rej ${s.byTier.rejected}/${ref.rechazados}  ` +
      `MQL dash ${s.reachedMql}`,
  );
}

console.log(`\nConv alineado PDF (Δ≤3): ${convOk}/${snaps.length}`);
