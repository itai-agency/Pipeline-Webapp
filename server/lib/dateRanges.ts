/** Fecha calendario UTC (YYYY-MM-DD). Criterio único para Kommo, Meta y dashboard. */
export function toUtcDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** @deprecated Usar toUtcDateIso — alias para migración gradual. */
export function toLocalDateIso(date: Date = new Date()): string {
  return toUtcDateIso(date);
}

/** Límites del día [since, until] en segundos Unix (UTC). */
export function toUtcUnixRange(since: string, until: string): { from: number; to: number } {
  const from = Math.floor(Date.parse(`${since}T00:00:00.000Z`) / 1000);
  const to = Math.floor(Date.parse(`${until}T23:59:59.999Z`) / 1000);
  return { from, to };
}

/** Del día 1 del mes de `endDate` hasta `endDate` (cohorte mensual Kommo). */
export function monthRangeEndingOn(endDate: string): { since: string; until: string } {
  const [y, m] = endDate.split("-").map(Number);
  const mm = String(m).padStart(2, "0");
  return { since: `${y}-${mm}-01`, until: endDate };
}

export function currentMonthRange(): { since: string; until: string } {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    since: toUtcDateIso(since),
    until: toUtcDateIso(now),
  };
}

/** 1 ene – hoy (UTC) del año indicado (o año en curso). */
export function yearToDateRange(year?: number): { since: string; until: string } {
  const y = year ?? new Date().getUTCFullYear();
  return { since: `${y}-01-01`, until: toUtcDateIso() };
}

function lastDayOfMonthUtcIso(year: number, month1to12: number): string {
  return toUtcDateIso(new Date(Date.UTC(year, month1to12, 0)));
}

/** Mes calendario completo (UTC), acotado a `capUntil` si cae en el futuro. */
export function calendarMonthRange(
  year: number,
  month1to12: number,
  capUntil?: string,
): { since: string; until: string } {
  const mm = String(month1to12).padStart(2, "0");
  const since = `${year}-${mm}-01`;
  let until = lastDayOfMonthUtcIso(year, month1to12);
  if (capUntil && until > capUntil) until = capUntil;
  return { since, until };
}

/** Meses 1..12 del año con until ≤ hoy (UTC). */
export function yearMonthChunks(year?: number): Array<{ since: string; until: string; label: string }> {
  const y = year ?? new Date().getUTCFullYear();
  const cap = toUtcDateIso();
  const now = new Date();
  const maxMonth = y < now.getUTCFullYear() ? 12 : now.getUTCMonth() + 1;
  const chunks: Array<{ since: string; until: string; label: string }> = [];
  for (let m = 1; m <= maxMonth; m += 1) {
    const range = calendarMonthRange(y, m, cap);
    if (range.since > cap) break;
    chunks.push({ ...range, label: `${y}-${String(m).padStart(2, "0")}` });
  }
  return chunks;
}
