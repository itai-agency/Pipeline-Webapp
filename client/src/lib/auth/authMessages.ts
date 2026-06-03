/** Vigencia del enlace de recuperación/invitación en Supabase (default del proyecto). */
export const AUTH_LINK_VALIDITY_LABEL = "1 hora";

export type AuthLinkProblem = "expired" | "invalid" | "no_session" | "session_missing";

export type AuthUrlError = {
  code: string | null;
  description: string | null;
};

/** Errores que Supabase devuelve en hash o query tras un enlace fallido. */
export function parseAuthUrlError(): AuthUrlError {
  if (typeof window === "undefined") return { code: null, description: null };
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const searchParams = new URLSearchParams(window.location.search);
  const code = hashParams.get("error_code") ?? searchParams.get("error_code");
  const rawDesc = hashParams.get("error_description") ?? searchParams.get("error_description");
  const description = rawDesc ? decodeURIComponent(rawDesc.replace(/\+/g, " ")) : null;
  return { code, description };
}

export function hasAuthLinkTokensInUrl(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash;
  const search = window.location.search;
  return (
    hash.includes("access_token=") ||
    hash.includes("type=recovery") ||
    hash.includes("type=invite") ||
    search.includes("code=") ||
    search.includes("token_hash=")
  );
}

export function classifyAuthLinkProblem(
  urlError: AuthUrlError,
  opts: { isAuthenticated: boolean; pendingFlow: boolean },
): AuthLinkProblem | null {
  const code = urlError.code?.toLowerCase() ?? "";
  const desc = urlError.description?.toLowerCase() ?? "";

  if (
    code === "otp_expired" ||
    desc.includes("expired") ||
    desc.includes("invalid or has expired")
  ) {
    return "expired";
  }

  if (urlError.code || urlError.description) {
    return "invalid";
  }

  if (hasAuthLinkTokensInUrl() && !opts.isAuthenticated) {
    return null;
  }

  if (!opts.isAuthenticated && !opts.pendingFlow) {
    return "no_session";
  }

  if (opts.pendingFlow && !opts.isAuthenticated) {
    return "session_missing";
  }

  return null;
}

export function authLinkProblemCopy(problem: AuthLinkProblem): {
  title: string;
  body: string[];
  tone: "warning" | "info";
} {
  switch (problem) {
    case "expired":
      return {
        title: "Enlace expirado",
        tone: "warning",
        body: [
          `Los enlaces de recuperación son válidos durante ${AUTH_LINK_VALIDITY_LABEL} desde que se envía el correo.`,
          "Si pasó más tiempo, solicita uno nuevo en inicio de sesión → «¿Olvidaste tu contraseña?».",
          "Usa siempre el correo más reciente; un enlace nuevo invalida los anteriores.",
        ],
      };
    case "invalid":
      return {
        title: "No pudimos validar este enlace",
        tone: "warning",
        body: [
          "El enlace puede estar incompleto, ya fue usado o fue abierto por un antivirus del correo antes que tú.",
          `Solicita un enlace fresco (válido ${AUTH_LINK_VALIDITY_LABEL}) o pide que te lo reenvíen por otro canal.`,
        ],
      };
    case "session_missing":
      return {
        title: "Sesión de recuperación no disponible",
        tone: "info",
        body: [
          "Abrimos el enlace pero aún no hay una sesión activa para cambiar la contraseña.",
          "Espera unos segundos y recarga; si persiste, pide un enlace nuevo.",
        ],
      };
    case "no_session":
      return {
        title: "Abre el enlace desde tu correo",
        tone: "info",
        body: [
          "Para definir tu contraseña necesitas entrar con el enlace que te enviamos (recuperación o invitación).",
          `Cada enlace funciona ${AUTH_LINK_VALIDITY_LABEL}. Si expiró, solicita otro desde inicio de sesión.`,
        ],
      };
  }
}

export function mapAuthError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "Email o contraseña incorrectos. Si olvidaste la contraseña, usa «¿Olvidaste tu contraseña?».";
  }
  if (lower.includes("email not confirmed")) {
    return "Confirma tu email antes de ingresar (revisa la bandeja de entrada y spam).";
  }
  if (lower.includes("same password")) {
    return "La nueva contraseña debe ser distinta a la anterior.";
  }
  if (
    lower.includes("invalid or has expired") ||
    lower.includes("otp_expired") ||
    lower.includes("email link is invalid")
  ) {
    return `El enlace expiró o ya no es válido. Solicita uno nuevo; cada enlace dura ${AUTH_LINK_VALIDITY_LABEL}.`;
  }
  if (lower.includes("auth session missing") || lower.includes("session missing")) {
    return `Tu sesión de recuperación expiró. Vuelve a solicitar el enlace (válido ${AUTH_LINK_VALIDITY_LABEL}).`;
  }
  if (lower.includes("rate limit") || lower.includes("over_email_send_rate_limit")) {
    return "Espera al menos 1 minuto antes de pedir otro enlace de recuperación.";
  }
  if (lower.includes("password should be at least")) {
    return "La contraseña debe cumplir la longitud mínima requerida (8 caracteres).";
  }
  if (lower.includes("signup is disabled")) {
    return "El registro público está desactivado. Pide una invitación al administrador.";
  }

  return message;
}

export const PASSWORD_RESET_EMAIL_SENT = [
  "Si ese email está registrado, recibirás un enlace en unos minutos.",
  `El enlace es válido durante ${AUTH_LINK_VALIDITY_LABEL}. Ábrelo desde el correo más reciente.`,
  "Revisa también spam y promociones. Si no llega, espera 1 minuto e inténtalo de nuevo.",
];
