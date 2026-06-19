import axios from "axios";
import { z } from "zod";
import { env, getMetaAccounts, isMetaConfigured, META_SYNC_EXCLUDED_CLIENTS, type MetaAccountConfig } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { sseHub } from "./sseHub.js";

/** Formularios / pixel lead (sin mensajería de fanpage). */
const META_LEAD_ACTION_TYPES = new Set([
  "lead",
  "leadgen_grouped",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
]);

/** Conversaciones iniciadas en fanpage / Messenger (Ads Manager). */
const META_FANPAGE_CONVERSATION_ACTION_TYPES = new Set([
  "onsite_conversion.messaging_conversation_started_7d",
]);

const insightsRowSchema = z.object({
  date_start: z.string(),
  spend: z.string().optional(),
  actions: z
    .array(z.object({ action_type: z.string(), value: z.string().optional() }))
    .optional(),
});

const insightsResponseSchema = z.object({
  data: z.array(insightsRowSchema).optional(),
  error: z
    .object({
      message: z.string(),
      type: z.string().optional(),
      code: z.number().optional(),
    })
    .optional(),
});

export type MetaSyncParams = {
  since: string;
  until: string;
};

export type MetaSyncResult = {
  processed: number;
  skipped: Array<{ client: string; accountId: string; reason: string }>;
};

export type MetaDailyRow = {
  date: string;
  spend: number;
  leads: number;
};

let metaLeadsColumnCached: boolean | null = null;

/** True si la migración 006 (columna leads) está aplicada en Supabase. */
export async function hasMetaLeadsColumn(): Promise<boolean> {
  if (metaLeadsColumnCached != null) return metaLeadsColumnCached;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    metaLeadsColumnCached = false;
    return false;
  }
  const { error } = await supabase.from("meta_spend_events").select("leads").limit(1);
  metaLeadsColumnCached = !error;
  return metaLeadsColumnCached;
}

function sumActionTypes(
  actions: Array<{ action_type: string; value?: string }> | undefined,
  types: Set<string>,
): number {
  let total = 0;
  for (const action of actions ?? []) {
    if (types.has(action.action_type)) {
      total += Number.parseInt(action.value ?? "0", 10) || 0;
    }
  }
  return total;
}

/** Formularios / pixel (sin fanpage). */
export function sumMetaLeadActions(
  actions: Array<{ action_type: string; value?: string }> | undefined,
): number {
  return sumActionTypes(actions, META_LEAD_ACTION_TYPES);
}

/** Conversaciones de fanpage según Meta Insights (referencia; dashboard conv = Kommo). */
export function sumMetaFanpageConversations(
  actions: Array<{ action_type: string; value?: string }> | undefined,
): number {
  return sumActionTypes(actions, META_FANPAGE_CONVERSATION_ACTION_TYPES);
}

/** Total Meta para scripts / meta_spend_events.leads (leadgen + fanpage). */
export function sumMetaCaptacionActions(
  actions: Array<{ action_type: string; value?: string }> | undefined,
): number {
  return sumMetaLeadActions(actions) + sumMetaFanpageConversations(actions);
}

function metaApiErrorMessage(err: unknown, account: MetaAccountConfig): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { error?: { message?: string; code?: number } } | undefined;
    if (body?.error?.message) return body.error.message;
    return err.message;
  }
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  return `Unknown error for ${account.client}`;
}

async function fetchAccountDailyInsights(
  account: MetaAccountConfig,
  since: string,
  until: string,
): Promise<MetaDailyRow[]> {
  const version = env.META_API_VERSION;
  const url = `https://graph.facebook.com/${version}/${account.accountId}/insights`;

  const response = await axios.get(url, {
    params: {
      access_token: env.META_ACCESS_TOKEN,
      fields: "spend,date_start,actions",
      time_range: JSON.stringify({ since, until }),
      time_increment: 1,
      level: "account",
      limit: 500,
    },
    timeout: 60_000,
  });

  const parsed = insightsResponseSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new AppError(`Meta insights parse error for ${account.client}`, 502);
  }
  if (parsed.data.error) {
    throw new AppError(`Meta API: ${parsed.data.error.message}`, 502, "META_API_ERROR");
  }

  return (parsed.data.data ?? []).map((row) => {
    const fanpage = sumMetaFanpageConversations(row.actions);
    const leadgen = sumMetaLeadActions(row.actions);
    const leads = leadgen + fanpage;
    // #region agent log
    if (fanpage > 0 || leadgen > 0) {
      fetch("http://127.0.0.1:7880/ingest/6fd1d614-7a66-4dcc-a425-d3b833f324c4", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a0037c" },
        body: JSON.stringify({
          sessionId: "a0037c",
          runId: "fanpage-conv",
          hypothesisId: "H1",
          location: "meta.service.ts:fetchAccountDailyInsights",
          message: "meta captacion breakdown",
          data: { client: account.client, date: row.date_start, leadgen, fanpage, leads },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    }
    // #endregion
    return {
      date: row.date_start,
      spend: Number.parseFloat(row.spend ?? "0") || 0,
      leads,
    };
  });
}

export async function syncMetaSpend(params: MetaSyncParams): Promise<MetaSyncResult> {
  if (!isMetaConfigured()) {
    throw new AppError("META_ACCESS_TOKEN is not configured", 503, "META_NOT_CONFIGURED");
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new AppError("Supabase is not configured", 503, "SUPABASE_NOT_CONFIGURED");
  }

  const accounts = getMetaAccounts();
  if (META_SYNC_EXCLUDED_CLIENTS.size > 0) {
    console.log(
      `[meta] Cuentas excluidas del sync: ${[...META_SYNC_EXCLUDED_CLIENTS].join(", ")} (Kommo/embudo sin cambio)`,
    );
  }
  let processed = 0;
  const skipped: MetaSyncResult["skipped"] = [];
  const storeLeads = await hasMetaLeadsColumn();

  await supabase.from("sync_runs").insert({
    source: "meta",
    status: "running",
  });

  try {
    for (const account of accounts) {
      let rows: MetaDailyRow[];
      try {
        rows = await fetchAccountDailyInsights(account, params.since, params.until);
      } catch (err) {
        const reason = metaApiErrorMessage(err, account);
        skipped.push({ client: account.client, accountId: account.accountId, reason });
        console.warn(
          `[meta] SKIP ${account.client} (${account.accountId}): ${reason} — conversaciones usarán Kommo created_at`,
        );
        // #region agent log
        fetch("http://127.0.0.1:7880/ingest/6fd1d614-7a66-4dcc-a425-d3b833f324c4", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a0037c" },
          body: JSON.stringify({
            sessionId: "a0037c",
            runId: "meta-sync-partial",
            hypothesisId: "H403-per-account",
            location: "meta.service.ts:syncMetaSpend",
            message: "account skipped",
            data: { client: account.client, accountId: account.accountId, reason },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        continue;
      }

      const accountSpend = rows.reduce((sum, row) => sum + row.spend, 0);
      const accountLeads = rows.reduce((sum, row) => sum + row.leads, 0);
      console.log(
        `[meta] ${account.client} (${account.accountId}): ${rows.length} días, $${accountSpend.toFixed(2)}, leads=${accountLeads} (${params.since}→${params.until})`,
      );
      for (const row of rows) {
        const record: Record<string, unknown> = {
          event_date: row.date,
          client: account.client,
          account_name: account.accountName,
          account_id: account.accountId,
          spend: row.spend,
          currency: "MXN",
          source: "meta_ads",
          synced_at: new Date().toISOString(),
        };
        if (storeLeads) record.leads = row.leads;
        const { error } = await supabase
          .from("meta_spend_events")
          .upsert(record, { onConflict: "event_date,account_id" });
        if (error) throw new AppError(`Supabase upsert failed: ${error.message}`, 500);
        processed += 1;
      }
    }

    if (processed === 0 && skipped.length > 0) {
      throw new AppError(
        `Meta sync failed for all accounts: ${skipped.map((s) => `${s.client} (${s.reason})`).join("; ")}`,
        502,
        "META_SYNC_ALL_FAILED",
      );
    }

    const syncNote =
      skipped.length > 0
        ? `partial: ${skipped.map((s) => s.client).join(", ")} skipped (Kommo fallback for conversaciones)`
        : undefined;

    await supabase.from("sync_runs").insert({
      source: "meta",
      status: "success",
      records_processed: processed,
      error_message: syncNote,
      finished_at: new Date().toISOString(),
    });

    // #region agent log
    fetch("http://127.0.0.1:7880/ingest/6fd1d614-7a66-4dcc-a425-d3b833f324c4", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a0037c" },
      body: JSON.stringify({
        sessionId: "a0037c",
        runId: "meta-sync-partial",
        hypothesisId: "H403-per-account",
        location: "meta.service.ts:syncMetaSpend",
        message: "sync complete",
        data: { processed, skippedCount: skipped.length, skippedClients: skipped.map((s) => s.client) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (skipped.length > 0) {
      console.warn(
        `[meta] Sync parcial: ${processed} filas OK; omitidos: ${skipped.map((s) => s.client).join(", ")}`,
      );
    }

    sseHub.broadcast("meta_updated", { recordsProcessed: processed, skipped });
    return { processed, skipped };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await supabase.from("sync_runs").insert({
      source: "meta",
      status: "error",
      error_message: message,
      finished_at: new Date().toISOString(),
    });
    throw err;
  }
}

export async function getMetaSpendFromDb(
  since?: string,
  until?: string,
): Promise<
  Array<{
    date: string;
    client: string;
    accountName: string;
    accountId: string;
    spend: number;
    leads: number;
    source: string;
  }>
> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const includeLeads = await hasMetaLeadsColumn();
  const fields = includeLeads
    ? "event_date, client, account_name, account_id, spend, leads, source"
    : "event_date, client, account_name, account_id, spend, source";

  let query = supabase.from("meta_spend_events").select(fields).order("event_date", { ascending: true });

  if (since) query = query.gte("event_date", since);
  if (until) query = query.lte("event_date", until);

  const { data, error } = await query;
  if (error) throw new AppError(`Failed to load meta spend: ${error.message}`, 500);

  return (data ?? []).map((row) => ({
    date: row.event_date as string,
    client: row.client as string,
    accountName: row.account_name as string,
    accountId: row.account_id as string,
    spend: Number(row.spend),
    leads: includeLeads ? Number((row as { leads?: number }).leads ?? 0) : 0,
    source: (row.source as string) ?? "meta_ads",
  }));
}
