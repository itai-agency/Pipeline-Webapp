import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadDotenv({ path: path.join(projectRoot, ".env.local") });
loadDotenv({ path: path.join(projectRoot, ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  SYNC_API_SECRET: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  /** Anon key — validación JWT de usuarios del dashboard (no usar service role aquí). */
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  /** Si no se define: true en production, false en development/test. */
  AUTH_REQUIRED: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      return v === "true" || v === "1";
    }),
  META_ACCESS_TOKEN: z.string().min(1).optional(),
  META_API_VERSION: z.string().default("v21.0"),
  KOMMO_SUBDOMAIN: z.string().optional(),
  KOMMO_ACCESS_TOKEN: z.string().min(1).optional(),
  KOMMO_PIPELINE_ID: z.string().optional(),
  KOMMO_CLIENT_MAP: z.string().default("{}"),
  KOMMO_STATUS_MAP: z.string().optional(),
  /** Si true, snapshot Kommo escribe números del HTML de control (no usar con backfill diario). */
  KOMMO_USE_CONTROL_REFERENCE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  /**
   * reachedMql/Sql/Cita: activos + rechazados con máx. tier pre-rechazo en timeline.
   * true (default) = siempre aplicar timeline. false = rollback umbral Gregorio legacy.
   */
  KOMMO_REACHED_REJECTED_TIMELINE: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  META_ACCOUNTS: z.string().optional(),
  /** Orígenes del front (Vercel), separados por coma. Ej: https://app.vercel.app */
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  /** Si true, permite cualquier https://*.vercel.app (previews). */
  CORS_ALLOW_VERCEL_PREVIEWS: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  /**
   * Secret que Kommo incluirá en la URL del webhook (?secret=…).
   * Si no se define, se usa SYNC_API_SECRET como fallback.
   * Incluir en la URL de webhook registrada en Kommo:
   *   https://<server>/api/webhook/kommo?secret=<KOMMO_WEBHOOK_SECRET>
   */
  KOMMO_WEBHOOK_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.warn("[env] Invalid environment variables:", parsed.error.flatten().fieldErrors);
    return envSchema.parse({});
  }
  return parsed.data;
}

export const env = loadEnv();

export function isSupabaseConfigured(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isSupabaseAuthConfigured(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

/** JWT obligatorio en rutas dashboard/realtime (default: sí en production). */
export function isAuthRequired(): boolean {
  if (typeof env.AUTH_REQUIRED === "boolean") return env.AUTH_REQUIRED;
  return env.NODE_ENV === "production";
}

export function isMetaConfigured(): boolean {
  return Boolean(env.META_ACCESS_TOKEN);
}

export function isKommoConfigured(): boolean {
  return Boolean(env.KOMMO_SUBDOMAIN && env.KOMMO_ACCESS_TOKEN);
}

/** true = activos + rechazados (timeline). false = rollback umbral Gregorio. */
export function isKommoReachedRejectedTimelineEnabled(): boolean {
  return env.KOMMO_REACHED_REJECTED_TIMELINE !== false;
}

export type MetaAccountConfig = {
  client: string;
  accountName: string;
  accountId: string;
};

export const DEFAULT_META_ACCOUNTS: MetaAccountConfig[] = [
  { client: "MANOS AL HOGAR", accountName: "Manos al hogar Publicidad", accountId: "act_1581946449839805" },
  { client: "INQ", accountName: "inq inmobiliaria cp", accountId: "act_1584938395981836" },
  { client: "HOGARES", accountName: "CInmubles Bajio", accountId: "act_349294690945338" },
  { client: "GRUPO ELIJO", accountName: "GRUPO ELIJO CP", accountId: "act_864948876563125" },
  // INSPIRA — omitida del sync Meta (ver META_SYNC_EXCLUDED_CLIENTS); Kommo sigue activo.
  { client: "INSPIRA", accountName: "Inspira Bienes Raices CP", accountId: "act_949679304398951" },
  { client: "DOS HOGARES", accountName: "IIHogares", accountId: "act_827524056673424" },
];

/** Omitidas del sync Meta Ads (sin llamada API). Quitar de la lista para reactivar. */
export const META_SYNC_EXCLUDED_CLIENTS = new Set<string>([
  "INSPIRA", // posible baja de cliente · 403 ads_read (may 2026)
]);

export function getMetaAccounts(): MetaAccountConfig[] {
  let accounts: MetaAccountConfig[];
  if (!env.META_ACCOUNTS) {
    accounts = DEFAULT_META_ACCOUNTS;
  } else {
    try {
      const parsed = JSON.parse(env.META_ACCOUNTS) as MetaAccountConfig[];
      accounts = Array.isArray(parsed) ? parsed : DEFAULT_META_ACCOUNTS;
    } catch {
      accounts = DEFAULT_META_ACCOUNTS;
    }
  }
  return accounts.filter((a) => !META_SYNC_EXCLUDED_CLIENTS.has(a.client));
}

/** Pipelines Kommo ↔ clientes del dashboard operativo Inmoleads */
export const DEFAULT_KOMMO_CLIENT_MAP: Record<string, string> = {
  "10970835": "HOGARES",
  "13029155": "INQ",
  "13224915": "INSPIRA",
  "13276279": "GRUPO ELIJO",
  "13519787": "DOS HOGARES",
  "12176815": "MANOS AL HOGAR",
};

export function getKommoClientMap(): Record<string, string> {
  try {
    const parsed = JSON.parse(env.KOMMO_CLIENT_MAP) as Record<string, string>;
    if (Object.keys(parsed).length > 0) return parsed;
    return DEFAULT_KOMMO_CLIENT_MAP;
  } catch {
    return DEFAULT_KOMMO_CLIENT_MAP;
  }
}

/** Clientes válidos del dashboard (Meta + Kommo). */
export function getCorsAllowedOrigins(): {
  exact: Set<string>;
  vercelPreviews: boolean;
  devLocal: RegExp;
} {
  const exact = new Set<string>();
  for (const item of (env.CORS_ALLOWED_ORIGINS ?? "").split(",")) {
    const origin = item.trim();
    if (origin) exact.add(origin);
  }
  return {
    exact,
    vercelPreviews: env.CORS_ALLOW_VERCEL_PREVIEWS === true,
    devLocal: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  };
}

export function getAllowedDashboardClients(): Set<string> {
  const names = new Set<string>();
  for (const client of Object.values(getKommoClientMap())) names.add(client);
  for (const account of getMetaAccounts()) names.add(account.client);
  return names;
}
