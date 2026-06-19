import { describe, expect, it } from "vitest";
import {
  computeRejectedByStage,
  type RejectionTimelineEvent,
} from "../lib/rejectedByStage.js";

let seq = 0;
function ev(partial: Partial<RejectionTimelineEvent>): RejectionTimelineEvent {
  return {
    kommo_lead_id: 1,
    client: "HOGARES",
    status_id: null,
    event_date: "2026-01-10",
    stage_name: "Entrada",
    lead_created_date: "2026-01-10",
    raw_payload: { created_at: ++seq },
    ...partial,
  };
}

describe("computeRejectedByStage", () => {
  it("clasifica al lead en su etapa MÁXIMA antes del rechazo", () => {
    const events = [
      ev({ kommo_lead_id: 1, stage_name: "MQL" }),
      ev({ kommo_lead_id: 1, stage_name: "SQL" }),
      ev({ kommo_lead_id: 1, stage_name: "Rechazado" }),
    ];
    const rows = computeRejectedByStage(events);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ CLIENTE: "HOGARES", MQL: 0, SQL: 1, CITAS: 0, FIRMAS: 0 });
  });

  it("ignora leads sin evento de rechazo", () => {
    const rows = computeRejectedByStage([
      ev({ kommo_lead_id: 2, stage_name: "SQL" }),
    ]);
    expect(rows).toHaveLength(0);
  });

  it("no cuenta etapas alcanzadas DESPUÉS del rechazo", () => {
    const rows = computeRejectedByStage([
      ev({ kommo_lead_id: 3, stage_name: "MQL" }),
      ev({ kommo_lead_id: 3, stage_name: "Rechazado" }),
      ev({ kommo_lead_id: 3, stage_name: "Cita" }),
    ]);
    expect(rows[0]).toMatchObject({ MQL: 1, SQL: 0, CITAS: 0, FIRMAS: 0 });
  });

  it("excluye rechazos que se quedaron en entrada o sin etapa previa", () => {
    const rows = computeRejectedByStage([
      ev({ kommo_lead_id: 4, stage_name: "Entrada" }),
      ev({ kommo_lead_id: 4, stage_name: "Rechazado" }),
      ev({ kommo_lead_id: 5, stage_name: "Rechazado" }),
    ]);
    expect(rows).toHaveLength(0);
  });

  it("pliega 'ofertado' en Citas (sin tarjeta propia)", () => {
    const rows = computeRejectedByStage([
      ev({ kommo_lead_id: 6, stage_name: "Ofertado" }),
      ev({ kommo_lead_id: 6, stage_name: "Rechazado" }),
    ]);
    expect(rows[0]).toMatchObject({ CITAS: 1, FIRMAS: 0 });
  });

  it("atribuye a lead_created_date y agrupa por fecha+cliente", () => {
    const rows = computeRejectedByStage([
      ev({ kommo_lead_id: 7, client: "INQ", lead_created_date: "2026-02-01", stage_name: "SQL", event_date: "2026-02-05" }),
      ev({ kommo_lead_id: 7, client: "INQ", lead_created_date: "2026-02-01", stage_name: "Rechazado", event_date: "2026-02-09" }),
      ev({ kommo_lead_id: 8, client: "INQ", lead_created_date: "2026-02-01", stage_name: "SQL", event_date: "2026-02-06" }),
      ev({ kommo_lead_id: 8, client: "INQ", lead_created_date: "2026-02-01", stage_name: "Rechazado", event_date: "2026-02-10" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ FECHA: "2026-02-01", CLIENTE: "INQ", SQL: 2 });
  });
});
