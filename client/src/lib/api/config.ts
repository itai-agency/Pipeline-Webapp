/** Base URL de la API (`/api` relativo en dev con Vite, absoluto en Vercel + backend aparte). */
export function getApiBase(): string {
  const remote = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (remote) return `${remote}/api`;
  return "/api";
}
