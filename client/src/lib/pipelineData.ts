/**
 * Filosofía visual: Swiss International Typographic Style aplicado a un war room ejecutivo de ventas.
 * Este archivo alimenta un tablero operativo: jerarquía numérica extrema, lectura asimétrica y alertas accionables.
 * Cuando se agreguen datos, preguntarse: ¿esto refuerza o diluye la capacidad de destrabar el pipeline hoy?
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

export const assetUrls = {
  hero: "https://d2xsxph8kpxj0f.cloudfront.net/310519663192733944/g3YM7dVXc44f7RABqxDP9z/pipeline-war-room-hero-5jjNfZcPjhwWpGSL8t2gWk.webp",
  funnel: "https://d2xsxph8kpxj0f.cloudfront.net/310519663192733944/g3YM7dVXc44f7RABqxDP9z/funnel-diagnostic-plate-eU5UFqmAk26T3znvtWTxKQ.webp",
  trajectory: "https://d2xsxph8kpxj0f.cloudfront.net/310519663192733944/g3YM7dVXc44f7RABqxDP9z/client-trajectory-map-Hazrr8SSspwzi9sfotTCED.webp",
} as const;

export const pipelineData = {
  "daily": [
    {
      "FECHA": "2026-05-01",
      "CLIENTE": "DOS HOGARES",
      "CONVERSACIONES": 2,
      "MQL": 0,
      "SQL": 0,
      "CITAS": 0,
      "FIRMAS": 0,
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
      "SEMANA": "2026-04-25"
    },
    {
      "FECHA": "2026-05-01",
      "CLIENTE": "HOGARES",
      "CONVERSACIONES": 5,
      "MQL": 2,
      "SQL": 0,
      "CITAS": 1,
      "FIRMAS": 0,
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
      "SEMANA": "2026-04-25"
    },
    {
      "FECHA": "2026-05-02",
      "CLIENTE": "DOS HOGARES",
      "CONVERSACIONES": 5,
      "MQL": 0,
      "SQL": 0,
      "CITAS": 1,
      "FIRMAS": 0,
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
      "SEMANA": "2026-05-02"
    },
    {
      "FECHA": "2026-05-02",
      "CLIENTE": "HOGARES",
      "CONVERSACIONES": 7,
      "MQL": 1,
      "SQL": 1,
      "CITAS": 0,
      "FIRMAS": 0,
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
      "SEMANA": "2026-05-02"
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
      "CONVERSACIONES": 34,
      "MQL": 0,
      "SQL": 0,
      "CITAS": 1,
      "FIRMAS": 0
    },
    {
      "SEMANA": "2026-05-02",
      "CLIENTE": "GRUPO ELIJO",
      "CONVERSACIONES": 51,
      "MQL": 7,
      "SQL": 1,
      "CITAS": 2,
      "FIRMAS": 0
    },
    {
      "SEMANA": "2026-05-02",
      "CLIENTE": "HOGARES",
      "CONVERSACIONES": 41,
      "MQL": 11,
      "SQL": 5,
      "CITAS": 3,
      "FIRMAS": 1
    },
    {
      "SEMANA": "2026-05-02",
      "CLIENTE": "INQ",
      "CONVERSACIONES": 92,
      "MQL": 7,
      "SQL": 1,
      "CITAS": 1,
      "FIRMAS": 2
    },
    {
      "SEMANA": "2026-05-02",
      "CLIENTE": "INSPIRA",
      "CONVERSACIONES": 16,
      "MQL": 2,
      "SQL": 0,
      "CITAS": 0,
      "FIRMAS": 0
    },
    {
      "SEMANA": "2026-05-02",
      "CLIENTE": "MANOS AL HOGAR",
      "CONVERSACIONES": 74,
      "MQL": 4,
      "SQL": 1,
      "CITAS": 1,
      "FIRMAS": 0
    }
  ],
  "monthly": [
    {
      "MES": "2026-05",
      "CLIENTE": "DOS HOGARES",
      "CONVERSACIONES": 36,
      "MQL": 0,
      "SQL": 0,
      "CITAS": 1,
      "FIRMAS": 0
    },
    {
      "MES": "2026-05",
      "CLIENTE": "GRUPO ELIJO",
      "CONVERSACIONES": 63,
      "MQL": 11,
      "SQL": 2,
      "CITAS": 2,
      "FIRMAS": 0
    },
    {
      "MES": "2026-05",
      "CLIENTE": "HOGARES",
      "CONVERSACIONES": 46,
      "MQL": 13,
      "SQL": 5,
      "CITAS": 4,
      "FIRMAS": 1
    },
    {
      "MES": "2026-05",
      "CLIENTE": "INQ",
      "CONVERSACIONES": 107,
      "MQL": 8,
      "SQL": 2,
      "CITAS": 2,
      "FIRMAS": 2
    },
    {
      "MES": "2026-05",
      "CLIENTE": "INSPIRA",
      "CONVERSACIONES": 22,
      "MQL": 4,
      "SQL": 0,
      "CITAS": 0,
      "FIRMAS": 0
    },
    {
      "MES": "2026-05",
      "CLIENTE": "MANOS AL HOGAR",
      "CONVERSACIONES": 83,
      "MQL": 4,
      "SQL": 1,
      "CITAS": 1,
      "FIRMAS": 0
    }
  ],
  "history": [
    {
      "MES": "ENERO",
      "CLIENTE": "HOGARES",
      "CONVERSACIONES": 315,
      "MQL": 35,
      "SQL": 23,
      "CITAS": 20,
      "FIRMAS": 2,
      "GASTO TOTAL": 14723,
      "COSTO POR CITA": 736.15
    },
    {
      "MES": "ENERO",
      "CLIENTE": "MANOS AL HOGAR",
      "CONVERSACIONES": 164,
      "MQL": 21,
      "SQL": 6,
      "CITAS": 7,
      "FIRMAS": 0,
      "GASTO TOTAL": 14470.12,
      "COSTO POR CITA": 2067.16
    },
    {
      "MES": "ENERO",
      "CLIENTE": "INQ",
      "CONVERSACIONES": 3,
      "MQL": 0,
      "SQL": 0,
      "CITAS": 0,
      "FIRMAS": 0,
      "GASTO TOTAL": 315.47,
      "COSTO POR CITA": 0
    },
    {
      "MES": "FEBRERO",
      "CLIENTE": "HOGARES",
      "CONVERSACIONES": 343,
      "MQL": 50,
      "SQL": 26,
      "CITAS": 23,
      "FIRMAS": 2,
      "GASTO TOTAL": 15042.84,
      "COSTO POR CITA": 654.04
    },
    {
      "MES": "FEBRERO",
      "CLIENTE": "MANOS AL HOGAR",
      "CONVERSACIONES": 137,
      "MQL": 14,
      "SQL": 10,
      "CITAS": 10,
      "FIRMAS": 1,
      "GASTO TOTAL": 10921.34,
      "COSTO POR CITA": 1092.13
    },
    {
      "MES": "FEBRERO",
      "CLIENTE": "INQ",
      "CONVERSACIONES": 263,
      "MQL": 24,
      "SQL": 9,
      "CITAS": 8,
      "FIRMAS": 2,
      "GASTO TOTAL": 14830.17,
      "COSTO POR CITA": 1853.77
    },
    {
      "MES": "FEBRERO",
      "CLIENTE": "INSPIRA",
      "CONVERSACIONES": 7,
      "MQL": 0,
      "SQL": 0,
      "CITAS": 0,
      "FIRMAS": 0,
      "GASTO TOTAL": 434.67,
      "COSTO POR CITA": 0
    },
    {
      "MES": "MARZO",
      "CLIENTE": "HOGARES",
      "CONVERSACIONES": 458,
      "MQL": 60,
      "SQL": 20,
      "CITAS": 28,
      "FIRMAS": 2,
      "GASTO TOTAL": 15429.34,
      "COSTO POR CITA": 551.05
    },
    {
      "MES": "MARZO",
      "CLIENTE": "MANOS AL HOGAR",
      "CONVERSACIONES": 222,
      "MQL": 22,
      "SQL": 10,
      "CITAS": 11,
      "FIRMAS": 2,
      "GASTO TOTAL": 15800.42,
      "COSTO POR CITA": 1436.4
    },
    {
      "MES": "MARZO",
      "CLIENTE": "INQ",
      "CONVERSACIONES": 389,
      "MQL": 33,
      "SQL": 25,
      "CITAS": 17,
      "FIRMAS": 0,
      "GASTO TOTAL": 19452.76,
      "COSTO POR CITA": 1144.28
    },
    {
      "MES": "MARZO",
      "CLIENTE": "INSPIRA",
      "CONVERSACIONES": 113,
      "MQL": 4,
      "SQL": 3,
      "CITAS": 3,
      "FIRMAS": 0,
      "GASTO TOTAL": 6344.8,
      "COSTO POR CITA": 2114.93
    },
    {
      "MES": "MARZO",
      "CLIENTE": "GRUPO ELIJO",
      "CONVERSACIONES": 132,
      "MQL": 20,
      "SQL": 13,
      "CITAS": 4,
      "FIRMAS": 0,
      "GASTO TOTAL": 7206.39,
      "COSTO POR CITA": 1801.6
    },
    {
      "MES": "ABRIL",
      "CLIENTE": "HOGARES",
      "CONVERSACIONES": 302,
      "MQL": 70,
      "SQL": 66,
      "CITAS": 24,
      "FIRMAS": 3,
      "GASTO TOTAL": 12497.47,
      "COSTO POR CITA": 520.73
    },
    {
      "MES": "ABRIL",
      "CLIENTE": "MANOS AL HOGAR",
      "CONVERSACIONES": 135,
      "MQL": 25,
      "SQL": 16,
      "CITAS": 17,
      "FIRMAS": 2,
      "GASTO TOTAL": 19544.45,
      "COSTO POR CITA": 1149.67
    },
    {
      "MES": "ABRIL",
      "CLIENTE": "INQ",
      "CONVERSACIONES": 428,
      "MQL": 32,
      "SQL": 24,
      "CITAS": 22,
      "FIRMAS": 3,
      "GASTO TOTAL": 18966.38,
      "COSTO POR CITA": 862.11
    },
    {
      "MES": "ABRIL",
      "CLIENTE": "INSPIRA",
      "CONVERSACIONES": 115,
      "MQL": 18,
      "SQL": 9,
      "CITAS": 4,
      "FIRMAS": 0,
      "GASTO TOTAL": 12168.53,
      "COSTO POR CITA": 3042.13
    },
    {
      "MES": "ABRIL",
      "CLIENTE": "GRUPO ELIJO",
      "CONVERSACIONES": 192,
      "MQL": 28,
      "SQL": 20,
      "CITAS": 7,
      "FIRMAS": 0,
      "GASTO TOTAL": 7689.8,
      "COSTO POR CITA": 1098.54
    },
    {
      "MES": "ABRIL",
      "CLIENTE": "2 HOGARES",
      "CONVERSACIONES": 45,
      "MQL": 8,
      "SQL": 1,
      "CITAS": 0,
      "FIRMAS": 0,
      "GASTO TOTAL": 4551.51,
      "COSTO POR CITA": 0
    }
  ],
  "dailyTotals": {
    "CONVERSACIONES": 357,
    "MQL": 40,
    "SQL": 10,
    "CITAS": 10,
    "FIRMAS": 3
  },
  "weeklyByClient": [
    {
      "key": "DOS HOGARES",
      "CONVERSACIONES": 36,
      "MQL": 0,
      "SQL": 0,
      "CITAS": 1,
      "FIRMAS": 0
    },
    {
      "key": "GRUPO ELIJO",
      "CONVERSACIONES": 63,
      "MQL": 11,
      "SQL": 2,
      "CITAS": 2,
      "FIRMAS": 0
    },
    {
      "key": "HOGARES",
      "CONVERSACIONES": 46,
      "MQL": 13,
      "SQL": 5,
      "CITAS": 4,
      "FIRMAS": 1
    },
    {
      "key": "INQ",
      "CONVERSACIONES": 107,
      "MQL": 8,
      "SQL": 2,
      "CITAS": 2,
      "FIRMAS": 2
    },
    {
      "key": "INSPIRA",
      "CONVERSACIONES": 22,
      "MQL": 4,
      "SQL": 0,
      "CITAS": 0,
      "FIRMAS": 0
    },
    {
      "key": "MANOS AL HOGAR",
      "CONVERSACIONES": 83,
      "MQL": 4,
      "SQL": 1,
      "CITAS": 1,
      "FIRMAS": 0
    }
  ],
  "dailyByDate": [
    {
      "key": "2026-05-01",
      "CONVERSACIONES": 49,
      "MQL": 9,
      "SQL": 2,
      "CITAS": 2,
      "FIRMAS": 0
    },
    {
      "key": "2026-05-02",
      "CONVERSACIONES": 56,
      "MQL": 7,
      "SQL": 2,
      "CITAS": 3,
      "FIRMAS": 0
    },
    {
      "key": "2026-05-04",
      "CONVERSACIONES": 117,
      "MQL": 7,
      "SQL": 1,
      "CITAS": 2,
      "FIRMAS": 0
    },
    {
      "key": "2026-05-05",
      "CONVERSACIONES": 79,
      "MQL": 9,
      "SQL": 2,
      "CITAS": 1,
      "FIRMAS": 2
    },
    {
      "key": "2026-05-06",
      "CONVERSACIONES": 56,
      "MQL": 8,
      "SQL": 3,
      "CITAS": 2,
      "FIRMAS": 1
    }
  ],
  "dailyByClient": [
    {
      "key": "DOS HOGARES",
      "CONVERSACIONES": 36,
      "MQL": 0,
      "SQL": 0,
      "CITAS": 1,
      "FIRMAS": 0
    },
    {
      "key": "GRUPO ELIJO",
      "CONVERSACIONES": 63,
      "MQL": 11,
      "SQL": 2,
      "CITAS": 2,
      "FIRMAS": 0
    },
    {
      "key": "HOGARES",
      "CONVERSACIONES": 46,
      "MQL": 13,
      "SQL": 5,
      "CITAS": 4,
      "FIRMAS": 1
    },
    {
      "key": "INQ",
      "CONVERSACIONES": 107,
      "MQL": 8,
      "SQL": 2,
      "CITAS": 2,
      "FIRMAS": 2
    },
    {
      "key": "INSPIRA",
      "CONVERSACIONES": 22,
      "MQL": 4,
      "SQL": 0,
      "CITAS": 0,
      "FIRMAS": 0
    },
    {
      "key": "MANOS AL HOGAR",
      "CONVERSACIONES": 83,
      "MQL": 4,
      "SQL": 1,
      "CITAS": 1,
      "FIRMAS": 0
    }
  ]
} as const;

export const stageLabels = ["CONVERSACIONES", "MQL", "SQL", "CITAS", "FIRMAS"] as const;
