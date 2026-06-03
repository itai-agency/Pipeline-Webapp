import { useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthFeedbackPanel } from "@/components/auth/AuthFeedbackPanel";
import { InlineAuthAlert } from "@/components/auth/AuthFeedbackPanel";
import {
  AUTH_LINK_VALIDITY_LABEL,
  classifyAuthLinkProblem,
  hasAuthLinkTokensInUrl,
  parseAuthUrlError,
} from "@/lib/auth/authMessages";
import { clearAuthHashFromUrl } from "@/lib/auth/authCallback";

const flowTitles: Record<string, { title: string; subtitle: string }> = {
  recovery: {
    title: "Nueva contraseña",
    subtitle: "Elige una contraseña nueva para tu cuenta.",
  },
  invite: {
    title: "Activa tu cuenta",
    subtitle: "Crea la contraseña con la que ingresarás al dashboard.",
  },
  signup: {
    title: "Define tu contraseña",
    subtitle: "Completa el registro con una contraseña segura.",
  },
};

const LINK_WAIT_MS = 6000;

export default function SetPassword() {
  const { pendingPasswordFlow, isLoading, isAuthenticated, updatePassword } = useAuth();
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [waitingForLink, setWaitingForLink] = useState(hasAuthLinkTokensInUrl());

  const urlError = useMemo(() => parseAuthUrlError(), []);
  const linkProblem = useMemo(
    () =>
      classifyAuthLinkProblem(urlError, {
        isAuthenticated,
        pendingFlow: !!pendingPasswordFlow,
      }),
    [urlError, isAuthenticated, pendingPasswordFlow],
  );

  useEffect(() => {
    if (isLoading) return;
    // #region agent log
    fetch("http://127.0.0.1:7880/ingest/6fd1d614-7a66-4dcc-a425-d3b833f324c4", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a0037c" },
      body: JSON.stringify({
        sessionId: "a0037c",
        location: "SetPassword.tsx:auth-state",
        message: "Auth set-password UI branch",
        data: {
          linkProblem,
          urlErrorCode: urlError.code,
          isAuthenticated,
          pendingPasswordFlow,
          waitingForLink,
          hasTokens: hasAuthLinkTokensInUrl(),
        },
        timestamp: Date.now(),
        hypothesisId: "UX-branch",
        runId: "post-fix",
      }),
    }).catch(() => {});
    // #endregion
  }, [isLoading, linkProblem, urlError.code, isAuthenticated, pendingPasswordFlow, waitingForLink]);

  useEffect(() => {
    if (!waitingForLink || isAuthenticated || linkProblem) {
      setWaitingForLink(false);
      return;
    }
    const timer = window.setTimeout(() => setWaitingForLink(false), LINK_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [waitingForLink, isAuthenticated, linkProblem]);

  const copy = flowTitles[pendingPasswordFlow ?? "recovery"] ?? flowTitles.recovery;
  const showForm = isAuthenticated && pendingPasswordFlow;
  const showLinkWait = waitingForLink && !showForm && !linkProblem;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    const result = await updatePassword(password);
    if (result.ok) {
      setLocation("/");
    } else {
      setError(result.message);
    }
    setSubmitting(false);
  };

  const goLogin = () => {
    clearAuthHashFromUrl();
    setLocation("/login");
  };

  if (isLoading || showLinkWait) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 p-4">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        <p className="text-sm text-slate-600 text-center max-w-sm">
          {showLinkWait
            ? "Activando tu enlace seguro… Esto puede tardar unos segundos."
            : "Verificando enlace…"}
        </p>
      </div>
    );
  }

  if (linkProblem && !showForm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <AuthFeedbackPanel
          problem={linkProblem}
          onGoLogin={goLogin}
          onRetry={linkProblem === "session_missing" ? () => window.location.reload() : undefined}
        />
      </div>
    );
  }

  if (!showForm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <AuthFeedbackPanel problem="no_session" onGoLogin={goLogin} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <KeyRound className="h-6 w-6 text-slate-700" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">{copy.title}</h1>
            <p className="text-slate-600 text-sm">{copy.subtitle}</p>
            <p className="text-xs text-slate-500 mt-3">
              Enlace activo. Guárdala antes de {AUTH_LINK_VALIDITY_LABEL} desde que recibiste el correo.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 mb-2">
                Contraseña nueva
              </label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-2">
                Confirmar contraseña
              </label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={submitting}
                className="w-full"
              />
            </div>

            {error ? <InlineAuthAlert message={error} /> : null}

            <Button
              type="submit"
              disabled={submitting || !password || !confirm}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white"
            >
              {submitting ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
