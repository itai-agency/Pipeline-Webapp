import { getSupabaseAdmin } from "./supabase.js";

let metricsSourceColumn: boolean | null = null;
let leadCreatedDateColumn: boolean | null = null;

/** true si existe migración 004 (metrics_source en dashboard_metrics_daily). */
export async function hasMetricsSourceColumn(): Promise<boolean> {
  if (metricsSourceColumn !== null) return metricsSourceColumn;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    metricsSourceColumn = false;
    return false;
  }
  const { error } = await supabase.from("dashboard_metrics_daily").select("metrics_source").limit(1);
  if (error && /metrics_source|column.*does not exist/i.test(error.message)) {
    metricsSourceColumn = false;
    return false;
  }
  metricsSourceColumn = true;
  return true;
}

export async function dailyMetricsOnConflict(): Promise<string> {
  return (await hasMetricsSourceColumn()) ? "metric_date,client,metrics_source" : "metric_date,client";
}

export type MetricsSourceKind = "timeline" | "census";

export async function withMetricsSource<T extends Record<string, unknown>>(
  row: T,
  source: MetricsSourceKind,
): Promise<T & { metrics_source?: MetricsSourceKind }> {
  if (!(await hasMetricsSourceColumn())) return row;
  return { ...row, metrics_source: source };
}

/** true si existe migración 005 (lead_created_date en kommo_lead_events). */
export async function hasLeadCreatedDateColumn(): Promise<boolean> {
  if (leadCreatedDateColumn !== null) return leadCreatedDateColumn;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    leadCreatedDateColumn = false;
    return false;
  }
  const { error } = await supabase.from("kommo_lead_events").select("lead_created_date").limit(1);
  if (error && /lead_created_date|column.*does not exist/i.test(error.message)) {
    leadCreatedDateColumn = false;
    return false;
  }
  leadCreatedDateColumn = true;
  return true;
}
