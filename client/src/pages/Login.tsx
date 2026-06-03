import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineAuthAlert } from "@/components/auth/AuthFeedbackPanel";
import { AUTH_LINK_VALIDITY_LABEL, PASSWORD_RESET_EMAIL_SENT } from "@/lib/auth/authMessages";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const { login, requestPasswordReset } = useAuth();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsLoading(true);

    const result = await login(email, password);
    if (result.ok) {
      setLocation("/");
    } else {
      setError(result.message);
    }
    setIsLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!email.trim()) {
      setError("Escribe tu email para enviar el enlace de recuperación.");
      return;
    }
    setIsLoading(true);
    const result = await requestPasswordReset(email);
    if (result.ok) {
      setSuccess("sent");
      setShowForgot(false);
    } else {
      setError(result.message);
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Pipeline</h1>
            <p className="text-slate-600">
              {showForgot ? "Recuperar contraseña" : "Acceso al dashboard de clientes"}
            </p>
          </div>

          {showForgot ? (
            <form onSubmit={handleForgot} className="space-y-4">
              <InlineAuthAlert
                variant="info"
                message={`Te enviaremos un enlace válido durante ${AUTH_LINK_VALIDITY_LABEL}. Úsalo pronto; si pide otro, el anterior dejará de funcionar.`}
              />
              <div>
                <label htmlFor="email-reset" className="block text-sm font-medium text-slate-700 mb-2">
                  Email
                </label>
                <Input
                  id="email-reset"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="w-full"
                />
              </div>
              {error ? <InlineAuthAlert message={error} /> : null}
              <Button type="submit" disabled={isLoading || !email} className="w-full bg-slate-900 text-white">
                {isLoading ? "Enviando…" : "Enviar enlace de recuperación"}
              </Button>
              <button
                type="button"
                className="w-full text-sm text-slate-600 hover:text-slate-900"
                onClick={() => {
                  setShowForgot(false);
                  setError("");
                }}
              >
                Volver al inicio de sesión
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="w-full"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                  Contraseña
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Tu contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full"
                />
              </div>

              {error ? <InlineAuthAlert message={error} /> : null}

              {success === "sent" ? (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <p className="font-medium mb-2">Correo enviado</p>
                  <ul className="list-disc pl-5 space-y-1 leading-relaxed">
                    {PASSWORD_RESET_EMAIL_SENT.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <Button
                type="submit"
                disabled={isLoading || !email || !password}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-2 rounded-lg transition-colors"
              >
                {isLoading ? "Ingresando..." : "Ingresar"}
              </Button>

              <button
                type="button"
                className="w-full text-sm text-slate-600 hover:text-slate-900"
                onClick={() => {
                  setShowForgot(true);
                  setError("");
                  setSuccess("");
                }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-500 text-center leading-relaxed">
              Acceso solo con invitación. Los enlaces del correo caducan en {AUTH_LINK_VALIDITY_LABEL}; abre el más
              reciente si pediste varios.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
