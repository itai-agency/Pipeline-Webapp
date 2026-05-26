import { supabaseBrowser } from "@/lib/supabase/browserClient";

export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!supabaseBrowser) return {};
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function getAccessToken(): Promise<string | null> {
  if (!supabaseBrowser) return null;
  const { data } = await supabaseBrowser.auth.getSession();
  return data.session?.access_token ?? null;
}
