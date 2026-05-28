/** Fecha local en ISO (YYYY-MM-DD). */
export function toLocalDateIso(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Rango desde el día 1 del mes actual hasta hoy (ISO date). */
/** Del día 1 del mes de `endDate` hasta `endDate` (cohorte mensual Kommo). */
export function monthRangeEndingOn(endDate: string): { since: string; until: string } {
  const [y, m] = endDate.split("-").map(Number);
  const mm = String(m).padStart(2, "0");
  return { since: `${y}-${mm}-01`, until: endDate };
}

export function currentMonthRange(): { since: string; until: string } {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    since: toLocalDateIso(since),
    until: toLocalDateIso(now),
  };
}

/** 1 ene – hoy del año indicado (o año en curso). */
export function yearToDateRange(year?: number): { since: string; until: string } {
  const y = year ?? new Date().getFullYear();
  return { since: `${y}-01-01`, until: toLocalDateIso() };
}

function lastDayOfMonthIso(year: number, month1to12: number): string {
  return toLocalDateIso(new Date(year, month1to12, 0));
}

/** Mes calendario completo, acotado a `capUntil` si cae en el futuro. */
export function calendarMonthRange(
  year: number,
  month1to12: number,
  capUntil?: string,
): { since: string; until: string } {
  const mm = String(month1to12).padStart(2, "0");
  const since = `${year}-${mm}-01`;
  let until = lastDayOfMonthIso(year, month1to12);
  if (capUntil && until > capUntil) until = capUntil;
  return { since, until };
}

/** Meses 1..12 del año con until ≤ hoy. */
export function yearMonthChunks(year?: number): Array<{ since: string; until: string; label: string }> {
  const y = year ?? new Date().getFullYear();
  const cap = toLocalDateIso();
  const now = new Date();
  const maxMonth = y < now.getFullYear() ? 12 : now.getMonth() + 1;
  const chunks: Array<{ since: string; until: string; label: string }> = [];
  for (let m = 1; m <= maxMonth; m += 1) {
    const range = calendarMonthRange(y, m, cap);
    if (range.since > cap) break;
    chunks.push({ ...range, label: `${y}-${String(m).padStart(2, "0")}` });
  }
  return chunks;
}
