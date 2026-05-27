import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getSupabaseConfigHint(): string | null {
  if (isSupabaseBrowserConfigured()) return null;
  const missing: string[] = [];
  if (!url) missing.push("VITE_SUPABASE_URL");
  if (!anonKey) missing.push("VITE_SUPABASE_ANON_KEY");
  if (missing.length === 0) return null;
  return `Faltan variables en el build: ${missing.join(", ")}. En Vercel la anon key debe llamarse VITE_SUPABASE_ANON_KEY (no SUPABASE_ANON_KEY).`;
}

export const supabaseBrowser = isSupabaseBrowserConfigured()
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
