/**
 * Referencia de control (index-1.html · corte 2026-05-26).
 * Embudo "reached*" según metodología Gregorio (kommoPipeline en el HTML).
 * Totales por etapa en kommoStageCounts (kommoData del HTML).
 */
export type KommoControlClientMetrics = {
  leads: number;
  reachedMql: number;
  reachedSql: number;
  reachedCita: number;
  firmas: number;
};

export type KommoControlSnapshot = {
  snapshotDate: string;
  clients: Record<string, KommoControlClientMetrics>;
};

/** Valores del HTML de referencia — actualizar cuando llegue un nuevo corte. */
export const KOMMO_CONTROL_REFERENCE: KommoControlSnapshot = {
  snapshotDate: "2026-05-26",
  clients: {
    HOGARES: { leads: 187, reachedMql: 65, reachedSql: 34, reachedCita: 9, firmas: 3 },
    INQ: { leads: 402, reachedMql: 32, reachedSql: 11, reachedCita: 9, firmas: 2 },
    INSPIRA: { leads: 80, reachedMql: 9, reachedSql: 5, reachedCita: 2, firmas: 0 },
    "GRUPO ELIJO": { leads: 438, reachedMql: 7, reachedSql: 3, reachedCita: 2, firmas: 2 },
    "DOS HOGARES": { leads: 99, reachedMql: 4, reachedSql: 1, reachedCita: 0, firmas: 0 },
    "MANOS AL HOGAR": { leads: 287, reachedMql: 20, reachedSql: 8, reachedCita: 7, firmas: 3 },
  },
};

export function getKommoControlMetrics(client: string): KommoControlClientMetrics | undefined {
  return KOMMO_CONTROL_REFERENCE.clients[client];
}
