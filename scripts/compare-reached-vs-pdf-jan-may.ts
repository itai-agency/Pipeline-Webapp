/**
 * Compara dashboard (timeline) vs PDF auditoría — ene a may 2026.
 *
 * Uso: node --use-system-ca --import tsx scripts/compare-reached-vs-pdf-jan-may.ts
 */
import { execSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "../server/config/env.js";
import { isKommoReachedRejectedTimelineEnabled, getKommoClientMap } from "../server/config/env.js";
import { tierReachedMql, type KommoStageTier } from "../server/config/kommoStageMap.js";
import { toAccountUnixRange } from "../server/lib/dateRanges.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { buildKommoMonthlyCohortSnapshots, fetchKommoStatuses } from "../server/services/kommo.service.js";
import { buildStatusTierMap } from "../server/lib/kommoReachedMetrics.js";
import {
  loadTimelinesForLeads,
  computeMaxPreRejectTier,
  TIER_RANK,
  type TimelineRow,
} from "./lib/rejectionAuditShared.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF_PATH =
  process.env.KOMMO_AUDIT_PDF ??
  "c:\\Users\\calec\\Downloads\\Auditoria_Kommo_Ene-Jun2026-1 completo.pdf";

const MONTHS = [
  { key: "2026-01", since: "2026-01-01", until: "2026-01-31" },
  { key: "2026-02", since: "2026-02-01", until: "2026-02-28" },
  { key: "2026-03", since: "2026-03-01", until: "2026-03-31" },
  { key: "2026-04", since: "2026-04-01", until: "2026-04-30" },
  { key: "2026-05", since: "2026-05-01", until: "2026-05-31" },
];

type PdfData = {
  monthly: Record<string, Record<string, { total: number; activos: number; rechazados: number; firmados: number }>>;
  activos_mql_snapshot: Record<string, Record<string, number>>;
};

function loadPdf(): PdfData {
  const script = join(__dirname, "_parse_pdf_audit_monthly.py");
  return JSON.parse(execSync(`python "${script}" "${PDF_PATH}"`, { encoding: "utf8" })) as PdfData;
}

async function apiCohort(
  client: string,
  pipelineId: number,
  since: string,
  until: string,
  statusTierById: Map<number, KommoStageTier>,
): Promise<{
  conv: number;
  activos: number;
  rechazados: number;
  preRejectMql: number;
  reachedMql: number;
}> {
  const { from, to } = toAccountUnixRange(since, until);
  const cohort: Array<{ id: number; tier: KommoStageTier }> = [];
  let page = 1;
  while (true) {
    const data = await kommoGet<{
      _embedded?: { leads?: Array<{ id: number; status_id?: number }> };
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
    const rows = data._embedded?.leads ?? [];
    for (const l of rows) {
      const tier = statusTierById.get(l.status_id ?? 0) ?? "entrada";
      if (tier !== "firmado") cohort.push({ id: l.id, tier });
    }
    if (!rows.length || rows.length < 250) break;
    page += 1;
  }

  const rejectedIds = cohort.filter((c) => c.tier === "rejected").map((c) => c.id);
  const timelines = await loadTimelinesForLeads(client, rejectedIds);
  let preRejectMql = 0;
  for (const id of rejectedIds) {
    const { maxRank } = computeMaxPreRejectTier(
      (timelines.get(id) ?? []) as TimelineRow[],
      statusTierById,
    );
    if (maxRank >= TIER_RANK.mql) preRejectMql += 1;
  }

  const activosMql = cohort.filter((c) => c.tier !== "rejected" && tierReachedMql(c.tier)).length;
  const activos = cohort.filter((c) => c.tier !== "rejected" && c.tier !== "firmado").length;

  return {
    conv: cohort.length,
    activos,
    rechazados: cohort.filter((c) => c.tier === "rejected").length,
    preRejectMql,
    reachedMql: activosMql + preRejectMql,
  };
}

async function main(): Promise<void> {
  const pdf = loadPdf();
  const allStatuses = await fetchKommoStatuses();
  const clientMap = getKommoClientMap();

  console.log(`Comparativa vs PDF auditoría · ene–may 2026`);
  console.log(
    `Modo: ${isKommoReachedRejectedTimelineEnabled() ? "timeline (activos+rechazados)" : "gregorio_gated"}\n`,
  );

  const rows: Array<Record<string, unknown>> = [];

  for (const { key, since, until } of MONTHS) {
    console.log(`\n── ${key} ──`);
    const snaps = await buildKommoMonthlyCohortSnapshots(since, until);

    for (const [pidStr, client] of Object.entries(clientMap).sort((a, b) =>
      a[1].localeCompare(b[1]),
    )) {
      const pdfM = pdf.monthly[client]?.[key];
      if (!pdfM) continue;

      const snap = snaps.find((s) => s.client === client);
      if (!snap) continue;

      const statusTierById = buildStatusTierMap(allStatuses, Number(pidStr));
      const api = await apiCohort(client, Number(pidStr), since, until, statusTierById);
      const pdfActMql = pdf.activos_mql_snapshot[client]?.[key] ?? 0;
      const pdfReachedRef = pdfActMql + api.preRejectMql;

      const dConv = api.conv - pdfM.total;
      const dRej = api.rechazados - pdfM.rechazados;
      const dMqlDash = snap.reachedMql - pdfReachedRef;

      const convOk = Math.abs(dConv) <= 3;
      const rejOk = Math.abs(dRej) <= 3;
      const mqlOk = Math.abs(dMqlDash) <= 5;

      const mark = convOk && rejOk ? (mqlOk ? "✓" : "~") : "≠";
      if (!convOk || !rejOk || Math.abs(dMqlDash) > 5) {
        console.log(
          `${mark} ${client.padEnd(16)} conv ${api.conv}/${pdfM.total} rej ${api.rechazados}/${pdfM.rechazados} ` +
            `MQL dash ${snap.reachedMql} ref ${pdfReachedRef} (actMQL ${pdfActMql}+preRej ${api.preRejectMql}) Δ${dMqlDash >= 0 ? "+" : ""}${dMqlDash}`,
        );
      }

      rows.push({
        month: key,
        client,
        pdf: pdfM,
        pdf_activos_mql: pdfActMql,
        api,
        dashboard: { reached_mql: snap.reachedMql, reached_sql: snap.reachedSql },
        pdf_reached_ref: pdfReachedRef,
        delta_conv: dConv,
        delta_rej: dRej,
        delta_mql: dMqlDash,
        conv_ok: convOk,
        rej_ok: rejOk,
        mql_ok: mqlOk,
      });
    }
  }

  const convOkN = rows.filter((r) => r.conv_ok).length;
  const rejOkN = rows.filter((r) => r.rej_ok).length;
  const mqlOkN = rows.filter((r) => r.mql_ok).length;

  console.log("\n══════════════════════════════════════════════════════════");
  console.log(`Conv Δ≤3:       ${convOkN}/${rows.length}`);
  console.log(`Rechazados Δ≤3: ${rejOkN}/${rows.length}`);
  console.log(`MQL Δ≤5:        ${mqlOkN}/${rows.length} (dash vs PDF_actMQL + timeline pre-rechazo)`);

  const outDir = join(process.cwd(), "reports");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "compare-reached-vs-pdf-jan-may-2026.json");
  writeFileSync(outPath, JSON.stringify({ rows, summary: { convOkN, rejOkN, mqlOkN, total: rows.length } }, null, 2));
  console.log(`\nJSON: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
