import { createClient, type User } from "@supabase/supabase-js";
import { env, isSupabaseAuthConfigured } from "../config/env.js";
import { UnauthorizedError } from "./errors.js";

let authClient: ReturnType<typeof createClient> | null = null;

function getSupabaseAuthClient() {
  if (!isSupabaseAuthConfigured()) return null;
  if (!authClient) {
    authClient = createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return authClient;
}

export async function verifyAccessToken(token: string): Promise<User> {
  const client = getSupabaseAuthClient();
  if (!client) {
    throw new UnauthorizedError("Auth is not configured on the server");
  }
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw new UnauthorizedError("Invalid or expired session");
  }
  return data.user;
}
