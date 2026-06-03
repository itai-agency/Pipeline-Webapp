import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { isDevAuthBypassEnabled } from "@/const";
import {
  clearAuthHashFromUrl,
  getPasswordRedirectUrl,
  parseAuthHashFlow,
  type AuthHashFlow,
} from "@/lib/auth/authCallback";
import { mapAuthError } from "@/lib/auth/authMessages";
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
  /** Usuario llegó por invitación o recovery y debe definir contraseña antes del dashboard. */
  pendingPasswordFlow: AuthHashFlow | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<LoginResult>;
  updatePassword: (password: string) => Promise<LoginResult>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function flowFromAuthEvent(event: AuthChangeEvent, hashFlow: AuthHashFlow | null): AuthHashFlow | null {
  if (event === "PASSWORD_RECOVERY") return "recovery";
  if (hashFlow === "invite" || hashFlow === "signup" || hashFlow === "recovery") return hashFlow;
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const devBypass = isDevAuthBypassEnabled();
  const [session, setSession] = useState<Session | null>(null);
  const [pendingPasswordFlow, setPendingPasswordFlow] = useState<AuthHashFlow | null>(null);
  const [isLoading, setIsLoading] = useState(!devBypass);

  const applyPendingFlow = useCallback((event: AuthChangeEvent, nextSession: Session | null) => {
    const hashFlow = parseAuthHashFlow();
    const flow = flowFromAuthEvent(event, hashFlow);
    if (flow && nextSession) {
      setPendingPasswordFlow(flow);
    }
  }, []);

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
    const hashFlow = parseAuthHashFlow();
    if (hashFlow) {
      setPendingPasswordFlow(hashFlow);
    }

    void supabaseBrowser.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (hashFlow && data.session) {
        setPendingPasswordFlow(hashFlow);
      }
      setIsLoading(false);
    });

    const { data: subscription } = supabaseBrowser.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      applyPendingFlow(event, nextSession);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [devBypass, applyPendingFlow]);

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
    setPendingPasswordFlow(null);
    return { ok: true };
  }, [devBypass]);

  const requestPasswordReset = useCallback(async (email: string): Promise<LoginResult> => {
    if (!supabaseBrowser) {
      return { ok: false, message: getSupabaseConfigHint() ?? "Supabase no está configurado" };
    }
    const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getPasswordRedirectUrl(),
    });
    if (error) {
      return { ok: false, message: mapAuthError(error.message) };
    }
    return { ok: true };
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<LoginResult> => {
    if (!supabaseBrowser) {
      return { ok: false, message: getSupabaseConfigHint() ?? "Supabase no está configurado" };
    }
    const { error } = await supabaseBrowser.auth.updateUser({ password });
    if (error) {
      return { ok: false, message: mapAuthError(error.message) };
    }
    setPendingPasswordFlow(null);
    clearAuthHashFromUrl();
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    if (devBypass) return;
    setPendingPasswordFlow(null);
    if (supabaseBrowser) {
      await supabaseBrowser.auth.signOut();
    }
    setSession(null);
    clearAuthHashFromUrl();
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
        pendingPasswordFlow: devBypass ? null : pendingPasswordFlow,
        login,
        logout,
        requestPasswordReset,
        updatePassword,
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
