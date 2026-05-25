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
  META_ACCESS_TOKEN: z.string().min(1).optional(),
  META_API_VERSION: z.string().default("v21.0"),
  KOMMO_SUBDOMAIN: z.string().optional(),
  KOMMO_ACCESS_TOKEN: z.string().min(1).optional(),
  KOMMO_PIPELINE_ID: z.string().optional(),
  KOMMO_CLIENT_MAP: z.string().default("{}"),
  KOMMO_STATUS_MAP: z.string().optional(),
  META_ACCOUNTS: z.string().optional(),
  /** Orígenes del front (Vercel), separados por coma. Ej: https://app.vercel.app */
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  /** Si true, permite cualquier https://*.vercel.app (previews). */
  CORS_ALLOW_VERCEL_PREVIEWS: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
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

export function isMetaConfigured(): boolean {
  return Boolean(env.META_ACCESS_TOKEN);
}

export function isKommoConfigured(): boolean {
  return Boolean(env.KOMMO_SUBDOMAIN && env.KOMMO_ACCESS_TOKEN);
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
  { client: "INSPIRA", accountName: "Inspira Bienes Raices CP", accountId: "act_949679304398951" },
  { client: "DOS HOGARES", accountName: "IIHogares GDL CP", accountId: "act_2175146543225091" },
];

export function getMetaAccounts(): MetaAccountConfig[] {
  if (!env.META_ACCOUNTS) return DEFAULT_META_ACCOUNTS;
  try {
    const parsed = JSON.parse(env.META_ACCOUNTS) as MetaAccountConfig[];
    return Array.isArray(parsed) ? parsed : DEFAULT_META_ACCOUNTS;
  } catch {
    return DEFAULT_META_ACCOUNTS;
  }
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
