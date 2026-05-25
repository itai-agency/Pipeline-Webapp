/** Fecha local en ISO (YYYY-MM-DD). */
export function toLocalDateIso(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Del día 1 del mes en curso al día vigente (zona horaria local). */
export function getCurrentMonthRange(reference: Date = new Date()): { start: string; end: string } {
  const start = `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end: toLocalDateIso(reference) };
}
