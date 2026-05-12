/**
 * Filosofía visual: Swiss International Typographic Style aplicado a un war room ejecutivo de ventas.
 * Este archivo conecta inversión publicitaria con citas para que la temporalidad elegida tenga lectura financiera inmediata.
 * Los importes totales fueron confirmados vía Meta Ads para 2026-05-01 a 2026-05-10; al no exponer el conector un time_increment diario estable,
 * la vista estática usa una distribución diaria proporcional uniforme para permitir filtros de fecha sin duplicar gasto.
 * Pregunta guía: ¿esto refuerza o diluye la capacidad de destrabar el pipeline hoy?
 */

export type MetaSpendRow = {
  date: string;
  client: string;
  accountName: string;
  accountId: string;
  spend: number;
  source: "meta_ads_confirmed_total_prorated_daily";
};

export const metaSpendPeriod = {
  start: "2026-05-01",
  end: "2026-05-10",
  sourceLabel: "Meta Ads · Importe gastado confirmado · prorrateo diario para filtros",
  note: "La suma del periodo completo coincide con Meta Ads; los cortes parciales usan prorrateo diario porque el dashboard es estático.",
} as const;

const dailyDates = [
  "2026-05-01",
  "2026-05-02",
  "2026-05-03",
  "2026-05-04",
  "2026-05-05",
  "2026-05-06",
  "2026-05-07",
  "2026-05-08",
  "2026-05-09",
  "2026-05-10",
] as const;

const confirmedTotals = [
  { client: "DOS HOGARES", accountName: "IIHogares GDL CP", accountId: "act_2175146543225091", totalSpend: 2378.06 },
  { client: "GRUPO ELIJO", accountName: "GRUPO ELIJO CP", accountId: "act_864948876563125", totalSpend: 2991.03 },
  { client: "HOGARES", accountName: "CInmubles Bajio", accountId: "act_349294690945338", totalSpend: 4376.63 },
  { client: "INQ", accountName: "inq inmobiliaria cp", accountId: "act_1584938395981836", totalSpend: 5906.62 },
  { client: "INSPIRA", accountName: "Inspira Bienes Raices CP", accountId: "act_949679304398951", totalSpend: 2900.79 },
  { client: "MANOS AL HOGAR", accountName: "Manos al hogar Publicidad", accountId: "act_1581946449839805", totalSpend: 7417.15 },
] as const;

function allocateDaily(total: number, index: number) {
  const base = Math.floor((total / dailyDates.length) * 100) / 100;
  if (index < dailyDates.length - 1) return base;
  return Number((total - base * (dailyDates.length - 1)).toFixed(2));
}

export const metaSpendData = confirmedTotals.flatMap((account) =>
  dailyDates.map((date, index) => ({
    date,
    client: account.client,
    accountName: account.accountName,
    accountId: account.accountId,
    spend: allocateDaily(account.totalSpend, index),
    source: "meta_ads_confirmed_total_prorated_daily" as const,
  })),
) satisfies MetaSpendRow[];

export const metaSpendTotals = confirmedTotals;
