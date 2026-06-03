/**
 * Zona horaria única para Kommo, Meta y dashboard (cuentas México).
 * Alinea filtros «Creados: ayer» de Kommo con cohortes diarias.
 */
export const ACCOUNT_TIMEZONE =
  process.env.KOMMO_DATE_TIMEZONE ?? process.env.META_DATE_TIMEZONE ?? "America/Mexico_City";

const accountDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: ACCOUNT_TIMEZONE });

/** Fecha calendario en ACCOUNT_TIMEZONE (YYYY-MM-DD). */
export function toAccountDateIso(date: Date): string {
  return accountDateFormatter.format(date);
}

/** @deprecated Usar toAccountDateIso */
export function toUtcDateIso(date: Date): string {
  return toAccountDateIso(date);
}

/** @deprecated Usar toAccountDateIso */
export function toLocalDateIso(date: Date = new Date()): string {
  return toAccountDateIso(date);
}

function getTimezoneOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - date.getTime();
}

function zonedTimeToUtc(dateStr: string, time: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm, ss] = time.split(":").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm, ss ?? 0);
  const offset = getTimezoneOffsetMs(ACCOUNT_TIMEZONE, new Date(utcGuess));
  return new Date(utcGuess - offset);
}

/** Límites del día [since, until] en segundos Unix según ACCOUNT_TIMEZONE. */
export function toAccountUnixRange(since: string, until: string): { from: number; to: number } {
  const from = Math.floor(zonedTimeToUtc(since, "00:00:00").getTime() / 1000);
  const to = Math.floor(zonedTimeToUtc(until, "23:59:59").getTime() / 1000);
  return { from, to };
}

/** @deprecated Usar toAccountUnixRange */
export function toUtcUnixRange(since: string, until: string): { from: number; to: number } {
  return toAccountUnixRange(since, until);
}

function accountYmd(date: Date): { y: number; m: number; d: number } {
  const s = toAccountDateIso(date);
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

/** Del día 1 del mes de `endDate` hasta `endDate` (cohorte mensual Kommo). */
export function monthRangeEndingOn(endDate: string): { since: string; until: string } {
  const [y, m] = endDate.split("-").map(Number);
  const mm = String(m).padStart(2, "0");
  return { since: `${y}-${mm}-01`, until: endDate };
}

export function currentMonthRange(): { since: string; until: string } {
  const now = new Date();
  const { y, m } = accountYmd(now);
  const mm = String(m).padStart(2, "0");
  return {
    since: `${y}-${mm}-01`,
    until: toAccountDateIso(now),
  };
}

/** 1 ene – hoy (zona cuenta) del año indicado (o año en curso). */
export function yearToDateRange(year?: number): { since: string; until: string } {
  const y = year ?? accountYmd(new Date()).y;
  return { since: `${y}-01-01`, until: toAccountDateIso() };
}

function lastDayOfMonthAccountIso(year: number, month1to12: number): string {
  const nextMonth = month1to12 === 12 ? { y: year + 1, m: 1 } : { y: year, m: month1to12 + 1 };
  const firstNext = zonedTimeToUtc(
    `${nextMonth.y}-${String(nextMonth.m).padStart(2, "0")}-01`,
    "00:00:00",
  );
  return toAccountDateIso(new Date(firstNext.getTime() - 86_400_000));
}

/** Suma días calendario en zona cuenta. */
export function addAccountDaysIso(dateStr: string, deltaDays: number): string {
  const anchor = zonedTimeToUtc(dateStr, "12:00:00");
  return toAccountDateIso(new Date(anchor.getTime() + deltaDays * 86_400_000));
}

/** Mes calendario completo (zona cuenta), acotado a `capUntil` si cae en el futuro. */
export function calendarMonthRange(
  year: number,
  month1to12: number,
  capUntil?: string,
): { since: string; until: string } {
  const mm = String(month1to12).padStart(2, "0");
  const since = `${year}-${mm}-01`;
  let until = lastDayOfMonthAccountIso(year, month1to12);
  if (capUntil && until > capUntil) until = capUntil;
  return { since, until };
}

/** Meses 1..12 del año con until ≤ hoy (zona cuenta). */
export function yearMonthChunks(year?: number): Array<{ since: string; until: string; label: string }> {
  const y = year ?? accountYmd(new Date()).y;
  const cap = toAccountDateIso();
  const now = new Date();
  const maxMonth = y < accountYmd(now).y ? 12 : accountYmd(now).m;
  const chunks: Array<{ since: string; until: string; label: string }> = [];
  for (let m = 1; m <= maxMonth; m += 1) {
    const range = calendarMonthRange(y, m, cap);
    if (range.since > cap) break;
    chunks.push({ ...range, label: `${y}-${String(m).padStart(2, "0")}` });
  }
  return chunks;
}
