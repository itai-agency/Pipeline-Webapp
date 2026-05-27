import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isDevAuthBypassEnabled } from "@/const";
import {
  getSupabaseConfigHint,
  isSupabaseBrowserConfigured,
  supabaseBrowser,
} from "@/lib/supabase/browserClient";

export type LoginResult = { ok: true } | { ok: false; message: string };

interface AuthContextType {
  isAuthenticated: boolean;
  isDevBypass: boolean;
  isLoading: boolean;
  user: User | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "Email o contraseña incorrectos";
  }
  if (lower.includes("email not confirmed")) {
    return "Confirma tu email antes de ingresar";
  }
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const devBypass = isDevAuthBypassEnabled();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(!devBypass);

  useEffect(() => {
    if (devBypass) {
      setIsLoading(false);
      return;
    }
    if (!supabaseBrowser) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    void supabaseBrowser.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabaseBrowser.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [devBypass]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    if (devBypass) return { ok: true };
    if (!supabaseBrowser || !isSupabaseBrowserConfigured()) {
      return {
        ok: false,
        message: getSupabaseConfigHint() ?? "Supabase no está configurado en el frontend",
      };
    }
    const { error } = await supabaseBrowser.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      return { ok: false, message: mapAuthError(error.message) };
    }
    return { ok: true };
  }, [devBypass]);

  const logout = useCallback(async () => {
    if (devBypass) return;
    if (supabaseBrowser) {
      await supabaseBrowser.auth.signOut();
    }
    setSession(null);
  }, [devBypass]);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (devBypass) return null;
    if (!supabaseBrowser) return null;
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token ?? null;
  }, [devBypass]);

  const isAuthenticated = devBypass || !!session;

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isDevBypass: devBypass,
        isLoading,
        user: session?.user ?? null,
        login,
        logout,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
