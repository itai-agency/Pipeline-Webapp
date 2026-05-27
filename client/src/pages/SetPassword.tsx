import { useState } from "react";
import { AlertCircle, KeyRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export default function SetPassword() {
  const { pendingPasswordFlow, isLoading, isAuthenticated, updatePassword } = useAuth();
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const copy = flowTitles[pendingPasswordFlow ?? "recovery"] ?? flowTitles.recovery;

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-600">Verificando enlace…</p>
      </div>
    );
  }

  if (!isAuthenticated || !pendingPasswordFlow) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8 text-center">
          <p className="text-slate-700 mb-4">Este enlace no es válido o ya expiró.</p>
          <Button type="button" onClick={() => setLocation("/login")} className="w-full">
            Ir al inicio de sesión
          </Button>
        </div>
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

            {error ? (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            ) : null}

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
