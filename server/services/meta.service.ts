import axios from "axios";
import { z } from "zod";
import { env, getMetaAccounts, isMetaConfigured, type MetaAccountConfig } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { sseHub } from "./sseHub.js";

const insightsRowSchema = z.object({
  date_start: z.string(),
  spend: z.string().optional(),
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

async function fetchAccountDailySpend(
  account: MetaAccountConfig,
  since: string,
  until: string,
): Promise<Array<{ date: string; spend: number }>> {
  const version = env.META_API_VERSION;
  const url = `https://graph.facebook.com/${version}/${account.accountId}/insights`;

  const response = await axios.get(url, {
    params: {
      access_token: env.META_ACCESS_TOKEN,
      fields: "spend,date_start",
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

  return (parsed.data.data ?? []).map((row) => ({
    date: row.date_start,
    spend: Number.parseFloat(row.spend ?? "0") || 0,
  }));
}

export async function syncMetaSpend(params: MetaSyncParams): Promise<number> {
  if (!isMetaConfigured()) {
    throw new AppError("META_ACCESS_TOKEN is not configured", 503, "META_NOT_CONFIGURED");
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new AppError("Supabase is not configured", 503, "SUPABASE_NOT_CONFIGURED");
  }

  const accounts = getMetaAccounts();
  let processed = 0;

  await supabase.from("sync_runs").insert({
    source: "meta",
    status: "running",
  });

  try {
    for (const account of accounts) {
      const rows = await fetchAccountDailySpend(account, params.since, params.until);
      const accountTotal = rows.reduce((sum, row) => sum + row.spend, 0);
      console.log(
        `[meta] ${account.client} (${account.accountId}): ${rows.length} días, $${accountTotal.toFixed(2)} (${params.since}→${params.until})`,
      );
      for (const row of rows) {
        const { error } = await supabase.from("meta_spend_events").upsert(
          {
            event_date: row.date,
            client: account.client,
            account_name: account.accountName,
            account_id: account.accountId,
            spend: row.spend,
            currency: "MXN",
            source: "meta_ads",
            synced_at: new Date().toISOString(),
          },
          { onConflict: "event_date,account_id" },
        );
        if (error) throw new AppError(`Supabase upsert failed: ${error.message}`, 500);
        processed += 1;
      }
    }

    await supabase
      .from("sync_runs")
      .insert({ source: "meta", status: "success", records_processed: processed, finished_at: new Date().toISOString() });

    sseHub.broadcast("meta_updated", { recordsProcessed: processed });
    return processed;
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
    source: string;
  }>
> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  let query = supabase
    .from("meta_spend_events")
    .select("event_date, client, account_name, account_id, spend, source")
    .order("event_date", { ascending: true });

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
    source: (row.source as string) ?? "meta_ads",
  }));
}
