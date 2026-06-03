/** Zona cuenta — misma que el API (America/Mexico_City). */
export const ACCOUNT_TIMEZONE = "America/Mexico_City";

const accountDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: ACCOUNT_TIMEZONE });

/** Fecha calendario en zona cuenta (YYYY-MM-DD). */
export function toAccountDateIso(date: Date = new Date()): string {
  return accountDateFormatter.format(date);
}

/** @deprecated Usar toAccountDateIso */
export function toUtcDateIso(date: Date = new Date()): string {
  return toAccountDateIso(date);
}

/** @deprecated Usar toAccountDateIso */
export function toLocalDateIso(date: Date = new Date()): string {
  return toAccountDateIso(date);
}

/** Del día 1 del mes en curso (zona cuenta) al día vigente. */
export function getCurrentMonthRange(reference: Date = new Date()): { start: string; end: string } {
  const end = toAccountDateIso(reference);
  const [y, m] = end.split("-");
  return { start: `${y}-${m}-01`, end };
}
