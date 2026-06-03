export type AuthHashFlow = "recovery" | "invite" | "signup";

/** Lee `type=` del hash que Supabase añade en enlaces de invitación o recovery. */
export function parseAuthHashFlow(): AuthHashFlow | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return null;
  const type = new URLSearchParams(raw).get("type");
  if (type === "recovery" || type === "invite" || type === "signup") return type;
  return null;
}

/** Quita tokens y errores de hash/query tras procesar el enlace. */
export function clearAuthHashFromUrl(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname);
}

export function getPasswordRedirectUrl(): string {
  return `${window.location.origin}/auth/set-password`;
}
