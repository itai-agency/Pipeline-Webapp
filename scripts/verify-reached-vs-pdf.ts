/**
 * Compara snapshot dashboard (reached*) vs PDF auditoría Kommo — no HTML.
 *
 * Uso:
 *   node --use-system-ca --import tsx scripts/verify-reached-vs-pdf.ts
 *   node --use-system-ca --import tsx scripts/verify-reached-vs-pdf.ts 2026-05-01 2026-05-31
 */
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import "../server/config/env.js";
import { isKommoReachedRejectedTimelineEnabled } from "../server/config/env.js";
import { getKommoClientMap } from "../server/config/env.js";
import {
  tierReachedMql,
  type KommoStageTier,
} from "../server/config/kommoStageMap.js";
import { toAccountUnixRange } from "../server/lib/dateRanges.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { buildKommoMonthlyCohortSnapshots, fetchKommoStatuses } from "../server/services/kommo.service.js";
import {
  buildStatusTierMap,
  stageColumnReached,
} from "../server/lib/kommoReachedMetrics.js";
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

const since = process.argv[2] ?? "2026-01-01";
const until = process.argv[3] ?? "2026-05-31";
const monthKey = since.slice(0, 7);

type PdfMonthly = {
  monthly: Record<string, Record<string, { total: number; activos: number; firmados: number; rechazados: number }>>;
  activos_mql_snapshot: Record<string, Record<string, number>>;
};

function loadPdfAudit(): PdfMonthly {
  const script = join(__dirname, "_parse_pdf_audit_monthly.py");
  const out = execSync(`python "${script}" "${PDF_PATH}"`, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(out) as PdfMonthly;
}

async function computePdfStyleReached(
  client: string,
  pipelineId: number,
  monthStart: string,
  monthEnd: string,
  statusTierById: Map<number, KommoStageTier>,
  pdfActivosMql: number,
): Promise<{ preRejectMql: number; reachedMql: number; conv: number }> {
  const { from, to } = toAccountUnixRange(monthStart, monthEnd);
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
    const events = timelines.get(id) ?? [];
    const { maxRank } = computeMaxPreRejectTier(events as TimelineRow[], statusTierById);
    if (maxRank >= TIER_RANK.mql) preRejectMql += 1;
  }

  const activosMqlApi = cohort.filter(
    (c) => c.tier !== "rejected" && tierReachedMql(c.tier),
  ).length;

  return {
    conv: cohort.length,
    preRejectMql,
    reachedMql: activosMqlApi + preRejectMql,
  };
}

async function main(): Promise<void> {
  const pdf = loadPdfAudit();
  const allStatuses = await fetchKommoStatuses();
  const clientMap = getKommoClientMap();

  console.log(`Referencia: PDF auditoría (${PDF_PATH})`);
  console.log(
    `Modo reached: ${isKommoReachedRejectedTimelineEnabled() ? "timeline (activos+rechazados)" : "gregorio_gated"}\n`,
  );
  console.log(`Rango API: ${since} → ${until} (mes ${monthKey})\n`);
  console.log(
    "Cliente          | PDF tot | API tot | Δconv | PDF act | API act | PDF rej | API rej | PDF actMQL* | Dash MQL | Δ MQL",
  );
  console.log("-".repeat(115));

  const rows: Array<Record<string, unknown>> = [];

  const snaps = await buildKommoMonthlyCohortSnapshots(since, until);

  for (const [pidStr, client] of Object.entries(clientMap).sort((a, b) =>
    a[1].localeCompare(b[1]),
  )) {
    const pdfMonth = pdf.monthly[client]?.[monthKey];
    if (!pdfMonth) continue;

    const snap = snaps.find((s) => s.client === client);
    if (!snap) continue;

    const pipelineId = Number(pidStr);
    const statusTierById = buildStatusTierMap(allStatuses, pipelineId);
    const stage = stageColumnReached(snap);
    const pdfActivosMql = pdf.activos_mql_snapshot[client]?.[monthKey] ?? 0;

    const api = await computePdfStyleReached(
      client,
      pipelineId,
      since,
      until,
      statusTierById,
      pdfActivosMql,
    );

    const apiActivos = snap.leads - snap.byTier.rejected - snap.byTier.firmado;
    const deltaConv = api.conv - pdfMonth.total;
    const deltaMql = snap.reachedMql - (pdfActivosMql + api.preRejectMql);

    console.log(
      `${client.padEnd(16)} | ${String(pdfMonth.total).padStart(7)} | ${String(api.conv).padStart(7)} | ${String(deltaConv).padStart(5)} | ` +
        `${String(pdfMonth.activos ?? "?").padStart(7)} | ${String(apiActivos).padStart(7)} | ` +
        `${String(pdfMonth.rechazados ?? "?").padStart(7)} | ${String(snap.byTier.rejected).padStart(7)} | ` +
        `${String(pdfActivosMql).padStart(11)} | ${String(snap.reachedMql).padStart(8)} | ${deltaMql >= 0 ? "+" : ""}${deltaMql}`,
    );

    rows.push({
      client,
      month: monthKey,
      pdf: pdfMonth,
      pdf_activos_mql_snapshot: pdfActivosMql,
      api: {
        conv: api.conv,
        activos: apiActivos,
        rechazados: snap.byTier.rejected,
        firmados: snap.byTier.firmado,
        activos_mql: stage.mql,
        pre_reject_mql: api.preRejectMql,
        reached_mql_timeline: api.reachedMql,
      },
      dashboard: {
        reached_mql: snap.reachedMql,
        reached_sql: snap.reachedSql,
        reached_cita: snap.reachedCita,
      },
      delta_conv: deltaConv,
      delta_mql_vs_pdf_timeline: deltaMql,
    });
  }

  console.log("\n* PDF actMQL = activos en MQL+ al corte 10/jun (etapa actual en PDF, no rechazados).");
  console.log("  Dash MQL = activos MQL+ + rechazados con max pre-rechazo ≥ MQL (timeline).");
  console.log("  Δ MQL compara dashboard vs PDF_actMQL + pre_rechazo timeline (referencia app).\n");

  const outDir = join(process.cwd(), "reports");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `verify-reached-vs-pdf-${monthKey}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        pdf_path: PDF_PATH,
        range: { since, until },
        rows,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`JSON: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
