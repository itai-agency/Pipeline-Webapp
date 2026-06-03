import { describe, expect, it } from "vitest";
import {
  finalCohortTierOnCreationDay,
  moldDailyMetricsFromTimeline,
  type LeadCohortMeta,
  type TimelineEventRow,
} from "../lib/kommoDailyMold.js";

const statusNameByKey = new Map<string, string>([
  ["10970835:1", "LEAD POR CALIFICAR"],
  ["10970835:2", "MQL"],
  ["10970835:3", "SQL"],
  ["10970835:4", "RECHAZADO"],
]);

function ev(
  leadId: number,
  date: string,
  afterName: string,
  createdAt: number,
): TimelineEventRow {
  const statusId = afterName === "MQL" ? 2 : afterName === "SQL" ? 3 : afterName === "RECHAZADO" ? 4 : 1;
  return {
    kommo_lead_id: leadId,
    event_date: date,
    client: "HOGARES",
    pipeline_id: 10970835,
    status_id: statusId,
    stage_name: afterName,
    lead_created_date: date,
    raw_payload: {
      created_at: createdAt,
      value_after: [{ lead_status: { id: statusId, pipeline_id: 10970835 } }],
      value_before: [{ lead_status: { id: 1, pipeline_id: 10970835 } }],
    },
  };
}

describe("kommoDailyMold", () => {
  it("cuenta una sola vez la etapa final del día de creación (no cada transición)", () => {
    const date = "2026-06-02";
    const cohort = new Map<number, LeadCohortMeta>([
      [1, { client: "HOGARES", createdDate: date }],
      [2, { client: "HOGARES", createdDate: date }],
    ]);
    const events: TimelineEventRow[] = [
      ev(1, date, "MQL", 100),
      ev(1, date, "SQL", 200),
      ev(1, date, "RECHAZADO", 300),
      ev(2, date, "LEAD POR CALIFICAR", 100),
      ev(2, date, "MQL", 200),
    ];
    const pipelineIdByClient = new Map([["HOGARES", 10970835]]);
    const grouped = moldDailyMetricsFromTimeline(events, cohort, statusNameByKey, pipelineIdByClient);
    const row = grouped.get(`${date}::HOGARES`);
    expect(row?.conversaciones).toBe(2);
    expect(row?.mql).toBe(1);
    expect(row?.sql).toBe(0);
  });

  it("sin eventos el lead queda en entrada", () => {
    const tier = finalCohortTierOnCreationDay([], statusNameByKey, 10970835);
    expect(tier).toBe("entrada");
  });
});
