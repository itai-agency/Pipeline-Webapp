/**
 * Compara gasto Meta API vs Supabase vs filtros típicos del dashboard.
 * Uso: npx tsx scripts/debug-meta-spend.ts
 */
import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "../server/config/env.js";
import { env, getMetaAccounts } from "../server/config/env.js";
import { getMetaSpendFromDb } from "../server/services/meta.service.js";
import { getDashboardSnapshot } from "../server/services/metrics.service.js";

const ACCOUNT_ID = "act_1581946449839805";
const LOG_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../debug-a0037c.log");

function log(hypothesisId: string, message: string, data: Record<string, unknown>) {
  const line = JSON.stringify({
    sessionId: "a0037c",
    runId: "meta-spend-audit",
    hypothesisId,
    location: "scripts/debug-meta-spend.ts",
    message,
    data,
    timestamp: Date.now(),
  });
  fs.appendFileSync(LOG_PATH, `${line}\n`);
  console.log(message, data);
}

async function fetchMetaAggregate(since: string, until: string, timeIncrement?: number) {
  const url = `https://graph.facebook.com/${env.META_API_VERSION}/${ACCOUNT_ID}/insights`;
  const params: Record<string, string | number> = {
    access_token: env.META_ACCESS_TOKEN!,
    fields: "spend,date_start,date_stop",
    time_range: JSON.stringify({ since, until }),
    level: "account",
    limit: 500,
  };
  if (timeIncrement != null) params.time_increment = timeIncrement;

  const res = await axios.get(url, { params, timeout: 60_000 });
  const rows = (res.data?.data ?? []) as Array<{ spend?: string; date_start?: string }>;
  const dailySum = rows.reduce((acc, r) => acc + (Number.parseFloat(r.spend ?? "0") || 0), 0);
  return { rows: rows.length, dailySum, raw: rows };
}

async function main() {
  if (fs.existsSync(LOG_PATH)) fs.unlinkSync(LOG_PATH);

  const account = getMetaAccounts().find((a) => a.accountId === ACCOUNT_ID);
  const ranges = [
    { label: "may_full", since: "2026-05-01", until: "2026-05-31" },
    { label: "may_12_20", since: "2026-05-12", until: "2026-05-20" },
    { label: "may_1_15", since: "2026-05-01", until: "2026-05-15" },
  ];

  log("H1", "account mapping", { account });

  for (const range of ranges) {
    const agg = await fetchMetaAggregate(range.since, range.until);
    const daily = await fetchMetaAggregate(range.since, range.until, 1);
    const db = await getMetaSpendFromDb(range.since, range.until);
    const dbAccount = db.filter((r) => r.accountId === ACCOUNT_ID);
    const dbSum = dbAccount.reduce((a, r) => a + r.spend, 0);

    log("H2", `range ${range.label}`, {
      since: range.since,
      until: range.until,
      metaAggregateSpend: agg.dailySum,
      metaAggregateRows: agg.rows,
      metaDailySum: daily.dailySum,
      metaDailyRows: daily.rows,
      supabaseRows: dbAccount.length,
      supabaseSum: dbSum,
      deltaMetaVsDb: daily.dailySum - dbSum,
    });
  }

  const snapshot = await getDashboardSnapshot();
  const pipelineDates = snapshot.daily.map((r) => r.FECHA).filter(Boolean).sort();
  const rangeStart = pipelineDates[0] ?? "";
  const rangeEnd = pipelineDates.at(-1) ?? "";

  const spendFiltered = snapshot.metaSpend.filter(
    (r) => r.date >= rangeStart && r.date <= rangeEnd,
  );
  const spendManos = spendFiltered.filter((r) => r.client === "MANOS AL HOGAR");
  const spendAll = spendFiltered.reduce((a, r) => a + r.spend, 0);
  const spendManosSum = spendManos.reduce((a, r) => a + r.spend, 0);

  log("H3", "dashboard default filter simulation", {
    pipelineRangeStart: rangeStart,
    pipelineRangeEnd: rangeEnd,
    inversionTodosClientes: spendAll,
    inversionManosAlHogar: spendManosSum,
    metaSpendPeriod: snapshot.metaSpendPeriod,
  });

  const metaFullMay = await fetchMetaAggregate("2026-05-01", "2026-05-31");
  log("H4", "meta full may single aggregate", {
    spend: metaFullMay.dailySum,
    userMetaUiReference: 15376.15,
    dashboardShown: 6583,
  });
}

main().catch((err) => {
  log("ERR", "script failed", { error: String(err) });
  process.exit(1);
});
