/**
 * Diagnóstico HOGARES 2026-06-02: Kommo API vs Supabase vs mold.
 */
import "../server/config/env.js";
import { getKommoClientMap } from "../server/config/env.js";
import { kommoGet } from "../server/lib/kommoApi.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";
import { fetchKommoLeadsPageByPipelineCreated } from "../server/services/kommo.service.js";
import { classifyKommoStageTier } from "../server/config/kommoStageMap.js";
import {
  sumMetaFanpageConversations,
  sumMetaLeadActions,
} from "../server/services/meta.service.js";
import { env, getMetaAccounts } from "../server/config/env.js";
import axios from "axios";

const DATE = "2026-06-02";
const CLIENT = "HOGARES";
const PIPELINE_ID = 10970835;

async function kommoLeadsCreatedOnDay(): Promise<void> {
  const byTier: Record<string, number> = {};
  const leads: Array<{ id: number; created: string; statusName: string; tier: string }> = [];
  let page = 1;
  while (true) {
    const batch = await fetchKommoLeadsPageByPipelineCreated(page, PIPELINE_ID, DATE, DATE);
    if (batch.length === 0) break;
    for (const lead of batch) {
      const created = new Date(lead.created_at * 1000).toISOString().slice(0, 10);
      const statusName = lead.status_name ?? lead.status?.name ?? "?";
      const tier = classifyKommoStageTier(statusName);
      byTier[tier] = (byTier[tier] ?? 0) + 1;
      leads.push({ id: lead.id, created, statusName, tier });
    }
    if (batch.length < 250) break;
    page += 1;
  }
  console.log("\n=== Kommo API cohorte created_at", DATE, "===");
  console.log("Total leads:", leads.length);
  console.log("Por tier (etapa actual):", byTier);
  for (const l of leads) {
    console.log(`  #${l.id} ${l.created} | ${l.statusName} → ${l.tier}`);
  }
}

async function supabaseSnapshot(): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    console.log("Supabase no configurado");
    return;
  }

  const { data: daily } = await sb
    .from("dashboard_metrics_daily")
    .select("metric_date, conversaciones, mql, sql, citas, firmas, gasto_total, metrics_source")
    .eq("client", CLIENT)
    .eq("metric_date", DATE);
  console.log("\n=== dashboard_metrics_daily", DATE, "===");
  console.log(daily);

  const { data: meta } = await sb
    .from("meta_spend_events")
    .select("event_date, spend, leads")
    .eq("client", CLIENT)
    .eq("event_date", DATE);
  console.log("\n=== meta_spend_events", DATE, "===");
  console.log(meta);

  const { data: events } = await sb
    .from("kommo_lead_events")
    .select("kommo_lead_id, event_date, lead_created_date, stage_name, mql")
    .eq("client", CLIENT)
    .eq("lead_created_date", DATE)
    .limit(50);
  console.log("\n=== kommo_lead_events lead_created_date", DATE, `(rows=${events?.length ?? 0}) ===`);

  const { data: mqlEvents } = await sb
    .from("kommo_lead_events")
    .select("kommo_lead_id, event_date, stage_name, mql")
    .eq("client", CLIENT)
    .eq("event_date", DATE)
    .gt("mql", 0);
  console.log("\n=== kommo timeline MQL en event_date", DATE, "===");
  console.log(mqlEvents?.length ?? 0, "filas con mql>0");
}

async function metaApiJun02(): Promise<void> {
  const account = getMetaAccounts().find((a) => a.client === CLIENT);
  if (!account || !env.META_ACCESS_TOKEN) {
    console.log("\nMeta no configurado");
    return;
  }
  const url = `https://graph.facebook.com/${env.META_API_VERSION}/${account.accountId}/insights`;
  const res = await axios.get(url, {
    params: {
      access_token: env.META_ACCESS_TOKEN,
      fields: "date_start,actions,spend",
      time_range: JSON.stringify({ since: DATE, until: DATE }),
      time_increment: 1,
      level: "account",
    },
  });
  const row = (res.data as { data?: Array<{ date_start: string; actions?: unknown[]; spend?: string }> })
    .data?.[0];
  const actions = row?.actions as Array<{ action_type: string; value?: string }> | undefined;
  console.log("\n=== Meta Insights", DATE, "cuenta", account.accountId, "===");
  console.log("spend:", row?.spend);
  const messaging = (actions ?? []).filter((a) =>
    /messaging_conversation|lead/i.test(a.action_type),
  );
  for (const a of messaging) {
    console.log(`  ${a.action_type}: ${a.value}`);
  }
  console.log("sumMetaLeadActions (leadgen/pixel):", sumMetaLeadActions(actions));
  console.log("sumMetaFanpageConversations:", sumMetaFanpageConversations(actions));
  console.log(
    "sumMetaCaptacion (leadgen+fanpage, = meta_spend_events.leads tras sync):",
    sumMetaLeadActions(actions) + sumMetaFanpageConversations(actions),
  );
}

async function main(): Promise<void> {
  console.log("Probe", CLIENT, DATE);
  await kommoLeadsCreatedOnDay();
  await supabaseSnapshot();
  await metaApiJun02();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
