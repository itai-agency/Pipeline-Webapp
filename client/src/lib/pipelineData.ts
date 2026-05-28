/*
 * Filosofía visual: Swiss International Typographic Style aplicado a un war room ejecutivo de ventas.
 * Este archivo alimenta un tablero operativo: jerarquía numérica extrema, lectura asimétrica y alertas accionables.
 * Cuando se agreguen datos, preguntarse: ¿esto refuerza o diluye la capacidad de destrabar el pipeline hoy?
 * 
 * Datos actualizados desde: 2026-05-14 12:36:00
 * Fuente: Google Sheet ID 1K-TdH3tk02Lu2i9zHGfXT7T2j691nANNzpQB8Fx_OxQ
 */

export type PipelineRow = {
  FECHA?: string | null;
  SEMANA?: string | null;
  MES?: string | null;
  CLIENTE: string;
  CONVERSACIONES: number;
  MQL: number;
  SQL: number;
  CITAS: number;
  FIRMAS: number;
  "GASTO TOTAL"?: number | null;
  "COSTO POR CITA"?: number | null;
  /** timeline = actividad por cambios de etapa; census = inventario al corte */
  METRICS_SOURCE?: "timeline" | "census";
};

export type AggregateRow = {
  key: string;
  CONVERSACIONES: number;
  MQL: number;
  SQL: number;
  CITAS: number;
  FIRMAS: number;
  "GASTO TOTAL"?: number;
  "COSTO POR CITA"?: number;
};

export type SdrHistoryRow = {
  FECHA?: string | null;
  SDR?: string | null;
  CLIENTE?: string | null;
  CITAS: number;
  FIRMAS: number;
  MES?: string | null;
};

export const assetUrls = {
  hero: "https://d2xsxph8kpxj0f.cloudfront.net/310519663192733944/g3YM7dVXc44f7RABqxDP9z/pipeline-war-room-hero-5jjNfZcPjhwWpGSL8t2gWk.webp",
  funnel: "https://d2xsxph8kpxj0f.cloudfront.net/310519663192733944/g3YM7dVXc44f7RABqxDP9z/funnel-diagnostic-plate-eU5UFqmAk26T3znvtWTxKQ.webp",
  trajectory: "https://d2xsxph8kpxj0f.cloudfront.net/310519663192733944/g3YM7dVXc44f7RABqxDP9z/client-trajectory-map-Hazrr8SSspwzi9sfotTCED.webp",
} as const;

export const pipelineData = {
  "daily": [
    {
        "FECHA": "2026-05-01",
        "CLIENTE": "HOGARES",
        "CONVERSACIONES": 5,
        "MQL": 2,
        "SQL": 0,
        "CITAS": 1,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-04-25"
    },
    {
        "FECHA": "2026-05-01",
        "CLIENTE": "INQ",
        "CONVERSACIONES": 15,
        "MQL": 1,
        "SQL": 1,
        "CITAS": 1,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-04-25"
    },
    {
        "FECHA": "2026-05-01",
        "CLIENTE": "INSPIRA",
        "CONVERSACIONES": 6,
        "MQL": 2,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-04-25"
    },
    {
        "FECHA": "2026-05-01",
        "CLIENTE": "GRUPO ELIJO",
        "CONVERSACIONES": 12,
        "MQL": 4,
        "SQL": 1,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-04-25"
    },
    {
        "FECHA": "2026-05-01",
        "CLIENTE": "DOS HOGARES",
        "CONVERSACIONES": 2,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-04-25"
    },
    {
        "FECHA": "2026-05-01",
        "CLIENTE": "MANOS AL HOGAR",
        "CONVERSACIONES": 9,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-04-25"
    },
    {
        "FECHA": "2026-05-02",
        "CLIENTE": "HOGARES",
        "CONVERSACIONES": 7,
        "MQL": 1,
        "SQL": 1,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-02",
        "CLIENTE": "INQ",
        "CONVERSACIONES": 19,
        "MQL": 3,
        "SQL": 1,
        "CITAS": 1,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-02",
        "CLIENTE": "INSPIRA",
        "CONVERSACIONES": 2,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-02",
        "CLIENTE": "GRUPO ELIJO",
        "CONVERSACIONES": 9,
        "MQL": 3,
        "SQL": 0,
        "CITAS": 1,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-02",
        "CLIENTE": "DOS HOGARES",
        "CONVERSACIONES": 5,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 1,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-02",
        "CLIENTE": "MANOS AL HOGAR",
        "CONVERSACIONES": 14,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-04",
        "CLIENTE": "HOGARES",
        "CONVERSACIONES": 16,
        "MQL": 4,
        "SQL": 1,
        "CITAS": 1,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-04",
        "CLIENTE": "INSPIRA",
        "CONVERSACIONES": 5,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-04",
        "CLIENTE": "INQ",
        "CONVERSACIONES": 30,
        "MQL": 1,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-04",
        "CLIENTE": "GRUPO ELIJO",
        "CONVERSACIONES": 21,
        "MQL": 1,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-04",
        "CLIENTE": "DOS HOGARES",
        "CONVERSACIONES": 15,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-04",
        "CLIENTE": "MANOS AL HOGAR",
        "CONVERSACIONES": 30,
        "MQL": 1,
        "SQL": 0,
        "CITAS": 1,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-05",
        "CLIENTE": "HOGARES",
        "CONVERSACIONES": 9,
        "MQL": 5,
        "SQL": 2,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-05",
        "CLIENTE": "INQ",
        "CONVERSACIONES": 25,
        "MQL": 1,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 2,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-05",
        "CLIENTE": "INSPIRA",
        "CONVERSACIONES": 5,
        "MQL": 1,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-05",
        "CLIENTE": "GRUPO ELIJO",
        "CONVERSACIONES": 14,
        "MQL": 1,
        "SQL": 0,
        "CITAS": 1,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-05",
        "CLIENTE": "DOS HOGARES",
        "CONVERSACIONES": 7,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-05",
        "CLIENTE": "MANOS AL HOGAR",
        "CONVERSACIONES": 19,
        "MQL": 1,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-06",
        "CLIENTE": "HOGARES",
        "CONVERSACIONES": 9,
        "MQL": 1,
        "SQL": 1,
        "CITAS": 2,
        "FIRMAS": 1,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-06",
        "CLIENTE": "INQ",
        "CONVERSACIONES": 18,
        "MQL": 2,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-06",
        "CLIENTE": "INSPIRA",
        "CONVERSACIONES": 4,
        "MQL": 1,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-06",
        "CLIENTE": "GRUPO ELIJO",
        "CONVERSACIONES": 7,
        "MQL": 2,
        "SQL": 1,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-06",
        "CLIENTE": "DOS HOGARES",
        "CONVERSACIONES": 7,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-06",
        "CLIENTE": "MANOS AL HOGAR",
        "CONVERSACIONES": 11,
        "MQL": 2,
        "SQL": 1,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-07",
        "CLIENTE": "HOGARES",
        "CONVERSACIONES": 12,
        "MQL": 3,
        "SQL": 2,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-07",
        "CLIENTE": "INQ",
        "CONVERSACIONES": 12,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 1,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-07",
        "CLIENTE": "INSPIRA",
        "CONVERSACIONES": 3,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-07",
        "CLIENTE": "GRUPO ELIJO",
        "CONVERSACIONES": 18,
        "MQL": 1,
        "SQL": 0,
        "CITAS": 1,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-07",
        "CLIENTE": "DOS HOGARES",
        "CONVERSACIONES": 8,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-07",
        "CLIENTE": "MANOS AL HOGAR",
        "CONVERSACIONES": 9,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-08",
        "CLIENTE": "HOGARES",
        "CONVERSACIONES": 2,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-08",
        "CLIENTE": "INQ",
        "CONVERSACIONES": 8,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-08",
        "CLIENTE": "INSPIRA",
        "CONVERSACIONES": 1,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 2,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-08",
        "CLIENTE": "GRUPO ELIJO",
        "CONVERSACIONES": 13,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-08",
        "CLIENTE": "DOS HOGARES",
        "CONVERSACIONES": 5,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-08",
        "CLIENTE": "MANOS AL HOGAR",
        "CONVERSACIONES": 8,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-02"
    },
    {
        "FECHA": "2026-05-09",
        "CLIENTE": "HOGARES",
        "CONVERSACIONES": 8,
        "MQL": 3,
        "SQL": 2,
        "CITAS": 1,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-09",
        "CLIENTE": "INQ",
        "CONVERSACIONES": 14,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-09",
        "CLIENTE": "INSPIRA",
        "CONVERSACIONES": 2,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-09",
        "CLIENTE": "GRUPO ELIJO",
        "CONVERSACIONES": 13,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-09",
        "CLIENTE": "DOS HOGARES",
        "CONVERSACIONES": 0,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-09",
        "CLIENTE": "MANOS AL HOGAR",
        "CONVERSACIONES": 8,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-11",
        "CLIENTE": "HOGARES",
        "CONVERSACIONES": 13,
        "MQL": 3,
        "SQL": 2,
        "CITAS": 1,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-11",
        "CLIENTE": "INQ",
        "CONVERSACIONES": 21,
        "MQL": 2,
        "SQL": 1,
        "CITAS": 1,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-11",
        "CLIENTE": "INSPIRA",
        "CONVERSACIONES": 5,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-11",
        "CLIENTE": "GRUPO ELIJO",
        "CONVERSACIONES": 37,
        "MQL": 2,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-11",
        "CLIENTE": "DOS HOGARES",
        "CONVERSACIONES": 1,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-11",
        "CLIENTE": "MANOS AL HOGAR",
        "CONVERSACIONES": 12,
        "MQL": 1,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 1,
        "GASTO TOTAL": null,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-12",
        "CLIENTE": "HOGARES",
        "CONVERSACIONES": 3,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 2,
        "FIRMAS": 0,
        "GASTO TOTAL": 386.28,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-12",
        "CLIENTE": "INQ",
        "CONVERSACIONES": 19,
        "MQL": 1,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": 610.44,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-12",
        "CLIENTE": "INSPIRA",
        "CONVERSACIONES": 5,
        "MQL": 1,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": 300.47,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-12",
        "CLIENTE": "GRUPO ELIJO",
        "CONVERSACIONES": 12,
        "MQL": 1,
        "SQL": 0,
        "CITAS": 1,
        "FIRMAS": 0,
        "GASTO TOTAL": 174.48,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-12",
        "CLIENTE": "DOS HOGARES",
        "CONVERSACIONES": 0,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": 0,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-12",
        "CLIENTE": "MANOS AL HOGAR",
        "CONVERSACIONES": 10,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 1,
        "FIRMAS": 1,
        "GASTO TOTAL": 518.29,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-15",
        "CLIENTE": "HOGARES",
        "CONVERSACIONES": 8,
        "MQL": 2,
        "SQL": 0,
        "CITAS": 2,
        "FIRMAS": 0,
        "GASTO TOTAL": 403.89,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-15",
        "CLIENTE": "INQ",
        "CONVERSACIONES": 13,
        "MQL": 1,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": 552.17,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-15",
        "CLIENTE": "INSPIRA",
        "CONVERSACIONES": 2,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": 273.72,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-15",
        "CLIENTE": "GRUPO ELIJO",
        "CONVERSACIONES": 17,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": 117.97,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-15",
        "CLIENTE": "DOS HOGARES",
        "CONVERSACIONES": 0,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": 0,
        "SEMANA": "2026-05-09"
    },
    {
        "FECHA": "2026-05-15",
        "CLIENTE": "MANOS AL HOGAR",
        "CONVERSACIONES": 12,
        "MQL": 3,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": 507.76,
        "SEMANA": "2026-05-09"
    }
],
  "weekly": [
    {
        "SEMANA": "2026-04-25",
        "CLIENTE": "DOS HOGARES",
        "CONVERSACIONES": 2,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0
    },
    {
        "SEMANA": "2026-04-25",
        "CLIENTE": "GRUPO ELIJO",
        "CONVERSACIONES": 12,
        "MQL": 4,
        "SQL": 1,
        "CITAS": 0,
        "FIRMAS": 0
    },
    {
        "SEMANA": "2026-04-25",
        "CLIENTE": "HOGARES",
        "CONVERSACIONES": 5,
        "MQL": 2,
        "SQL": 0,
        "CITAS": 1,
        "FIRMAS": 0
    },
    {
        "SEMANA": "2026-04-25",
        "CLIENTE": "INQ",
        "CONVERSACIONES": 15,
        "MQL": 1,
        "SQL": 1,
        "CITAS": 1,
        "FIRMAS": 0
    },
    {
        "SEMANA": "2026-04-25",
        "CLIENTE": "INSPIRA",
        "CONVERSACIONES": 6,
        "MQL": 2,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0
    },
    {
        "SEMANA": "2026-04-25",
        "CLIENTE": "MANOS AL HOGAR",
        "CONVERSACIONES": 9,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0
    },
    {
        "SEMANA": "2026-05-02",
        "CLIENTE": "DOS HOGARES",
        "CONVERSACIONES": 47,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 1,
        "FIRMAS": 0
    },
    {
        "SEMANA": "2026-05-02",
        "CLIENTE": "GRUPO ELIJO",
        "CONVERSACIONES": 82,
        "MQL": 8,
        "SQL": 1,
        "CITAS": 3,
        "FIRMAS": 0
    },
    {
        "SEMANA": "2026-05-02",
        "CLIENTE": "HOGARES",
        "CONVERSACIONES": 55,
        "MQL": 14,
        "SQL": 7,
        "CITAS": 3,
        "FIRMAS": 1
    },
    {
        "SEMANA": "2026-05-02",
        "CLIENTE": "INQ",
        "CONVERSACIONES": 112,
        "MQL": 7,
        "SQL": 1,
        "CITAS": 2,
        "FIRMAS": 2
    },
    {
        "SEMANA": "2026-05-02",
        "CLIENTE": "INSPIRA",
        "CONVERSACIONES": 20,
        "MQL": 2,
        "SQL": 0,
        "CITAS": 2,
        "FIRMAS": 0
    },
    {
        "SEMANA": "2026-05-02",
        "CLIENTE": "MANOS AL HOGAR",
        "CONVERSACIONES": 91,
        "MQL": 4,
        "SQL": 1,
        "CITAS": 1,
        "FIRMAS": 0
    },
    {
        "SEMANA": "2026-05-09",
        "CLIENTE": "DOS HOGARES",
        "CONVERSACIONES": 1,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0
    },
    {
        "SEMANA": "2026-05-09",
        "CLIENTE": "GRUPO ELIJO",
        "CONVERSACIONES": 50,
        "MQL": 2,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0
    },
    {
        "SEMANA": "2026-05-09",
        "CLIENTE": "HOGARES",
        "CONVERSACIONES": 21,
        "MQL": 6,
        "SQL": 4,
        "CITAS": 2,
        "FIRMAS": 0
    },
    {
        "SEMANA": "2026-05-09",
        "CLIENTE": "INQ",
        "CONVERSACIONES": 35,
        "MQL": 2,
        "SQL": 1,
        "CITAS": 1,
        "FIRMAS": 0
    },
    {
        "SEMANA": "2026-05-09",
        "CLIENTE": "INSPIRA",
        "CONVERSACIONES": 7,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0
    },
    {
        "SEMANA": "2026-05-09",
        "CLIENTE": "MANOS AL HOGAR",
        "CONVERSACIONES": 20,
        "MQL": 1,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 1
    }
],
  "monthly": [
    {
        "MES": "#REF!",
        "CLIENTE": "HOGARES",
        "CONVERSACIONES": 0,
        "MQL": 0,
        "SQL": 0,
        "CITAS": 0,
        "FIRMAS": 0,
        "GASTO TOTAL": null,
        "COSTO POR CITA": null
    }
],
  "sdrHistory": []
};

export const stageLabels: Record<string, string> = {
  CONVERSACIONES: "Conversaciones",
  MQL: "MQL",
  SQL: "SQL",
  CITAS: "Citas",
  FIRMAS: "Firmas",
};
