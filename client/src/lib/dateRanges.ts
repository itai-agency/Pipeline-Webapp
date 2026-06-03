/** Fecha calendario UTC (YYYY-MM-DD). Mismo criterio que el API. */
export function toUtcDateIso(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** @deprecated Usar toUtcDateIso */
export function toLocalDateIso(date: Date = new Date()): string {
  return toUtcDateIso(date);
}

/** Del día 1 del mes en curso (UTC) al día vigente (UTC). */
export function getCurrentMonthRange(reference: Date = new Date()): { start: string; end: string } {
  const start = `${reference.getUTCFullYear()}-${String(reference.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return { start, end: toUtcDateIso(reference) };
}
