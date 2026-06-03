/**
 * Compara CONVERSACIONES Excel vs Kommo created_at vs Meta Insights (actions lead).
 */
import "../server/config/env.js";
import axios from "axios";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { env, getMetaAccounts, getKommoClientMap, isMetaConfigured, isKommoConfigured } from "../server/config/env.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { fetchKommoLeadsPageByPipelineCreated } from "../server/services/kommo.service.js";

const MONTH_START = "2026-05-01";
const CUTOFF = "2026-05-26";

const LEAD_ACTION_TYPES = new Set([
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "leadgen_grouped",
  "onsite_conversion.messaging_conversation_started_7d",
]);

const insightsSchema = z.object({
  data: z
    .array(
      z.object({
        date_start: z.string(),
        actions: z
          .array(z.object({ action_type: z.string(), value: z.string().optional() }))
          .optional(),
      }),
    )
    .optional(),
  error: z.object({ message: z.string() }).optional(),
});

function sumLeadActions(actions: Array<{ action_type: string; value?: string }> | undefined): number {
  let n = 0;
  for (const a of actions ?? []) {
    if (LEAD_ACTION_TYPES.has(a.action_type)) {
      n += Number.parseInt(a.value ?? "0", 10) || 0;
    }
  }
  return n;
}

async function fetchMetaLeadsByDay(accountId: string, since: string, until: string) {
  const url = `https://graph.facebook.com/${env.META_API_VERSION}/${accountId}/insights`;
  const res = await axios.get(url, {
    params: {
      access_token: env.META_ACCESS_TOKEN,
      fields: "date_start,actions",
      time_range: JSON.stringify({ since, until }),
      time_increment: 1,
      level: "account",
      limit: 500,
    },
    timeout: 60_000,
  });
  const parsed = insightsSchema.safeParse(res.data);
  if (!parsed.success || parsed.data.error) {
    throw new Error(parsed.data?.error?.message ?? "Meta parse error");
  }
  const byDate = new Map<string, number>();
  for (const row of parsed.data.data ?? []) {
    byDate.set(row.date_start, sumLeadActions(row.actions));
  }
  return byDate;
}

async function kommoCreatedByDay(client: string, pipelineId: number) {
  const byDate = new Map<string, number>();
  let page = 1;
  const from = Math.floor(new Date(`${MONTH_START}T00:00:00`).getTime() / 1000);
  const to = Math.floor(new Date(`${CUTOFF}T23:59:59`).getTime() / 1000);
  while (true) {
    const leads = await fetchKommoLeadsPageByPipelineCreated(page, pipelineId, MONTH_START, CUTOFF);
    if (!leads.length) break;
    for (const l of leads) {
      const d = l.created_at ? new Date(l.created_at * 1000).toISOString().slice(0, 10) : MONTH_START;
      byDate.set(d, (byDate.get(d) ?? 0) + 1);
    }
    if (leads.length < 250) break;
    page += 1;
  }
  return byDate;
}

async function main() {
  const client = (process.argv[2] ?? "DOS HOGARES").replace(/_/g, " ").toUpperCase();
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const excel = (JSON.parse(readFileSync(join(root, "reports/excel_daily_by_client.json"), "utf8")) as Record<
    string,
    Array<{ fecha: string; conv: number }>
  >)[client]!.filter((d) => d.fecha >= MONTH_START && d.fecha <= CUTOFF);

  const pid = Number(Object.entries(getKommoClientMap()).find(([, c]) => c === client)?.[0]);
  const metaAcc = getMetaAccounts().find((a) => a.client === client);

  let metaByDay = new Map<string, number>();
  if (isMetaConfigured() && metaAcc) {
    try {
      metaByDay = await fetchMetaLeadsByDay(metaAcc.accountId, MONTH_START, CUTOFF);
      console.log(`Meta leads OK para ${client}`);
    } catch (e) {
      console.log("Meta API error:", e instanceof Error ? e.message : e);
    }
  }

  let kommoByDay = new Map<string, number>();
  if (isKommoConfigured() && pid) {
    kommoByDay = await kommoCreatedByDay(client, pid);
  }

  let exactMeta = 0;
  let exactKommo = 0;
  let maeMeta = 0;
  let maeKommo = 0;
  console.log(`\n=== ${client}: CONVERSACIONES Excel vs Meta vs Kommo created_at ===\n`);
  console.log("fecha       | Excel | Meta | Kommo | best");
  for (const row of excel) {
    const ex = Math.round(row.conv);
    const meta = Math.round(metaByDay.get(row.fecha) ?? -1);
    const kommo = Math.round(kommoByDay.get(row.fecha) ?? 0);
    const metaOk = meta >= 0 && meta === ex;
    const kommoOk = kommo === ex;
    if (metaOk) exactMeta += 1;
    if (kommoOk) exactKommo += 1;
    if (meta >= 0) maeMeta += Math.abs(meta - ex);
    maeKommo += Math.abs(kommo - ex);
    const best = metaOk ? "Meta" : kommoOk ? "Kommo" : "";
    console.log(
      `${row.fecha} | ${String(ex).padStart(5)} | ${meta >= 0 ? String(meta).padStart(4) : "  n/a"} | ${String(kommo).padStart(5)} | ${best}`,
    );
  }
  const sumEx = excel.reduce((s, r) => s + r.conv, 0);
  const sumMeta = [...metaByDay.values()].reduce((a, b) => a + b, 0);
  const sumKommo = [...kommoByDay.values()].reduce((a, b) => a + b, 0);
  console.log(`\nSuma mes: Excel=${sumEx} Meta=${sumMeta} Kommo=${sumKommo}`);
  console.log(`Match dia: Meta ${exactMeta}/22 MAE=${maeMeta} | Kommo ${exactKommo}/22 MAE=${maeKommo}`);
}

main().catch(console.error);
