import { describe, expect, it } from "vitest";
import { resolveReachedEnrichment } from "../lib/kommoReachedMetrics.js";

describe("resolveReachedEnrichment", () => {
  const base = {
    stage: { mql: 5, sql: 3, cita: 1 },
    activeMql: 5,
    activeSql: 3,
    activeCita: 1,
    preRejectMql: 40,
    preRejectSql: 20,
    preRejectCita: 8,
  };

  it("timeline mode always sums activos + pre-rechazo", () => {
    const r = resolveReachedEnrichment({ ...base, timelineMode: true });
    expect(r.mode).toBe("timeline");
    expect(r.reachedMql).toBe(45);
    expect(r.reachedSql).toBe(23);
    expect(r.reachedCita).toBe(9);
    expect(r.usedGregorio).toBe(true);
  });

  it("gregorio gated mode uses umbral legacy", () => {
    const r = resolveReachedEnrichment({
      ...base,
      timelineMode: false,
      stage: { mql: 12, sql: 3, cita: 1 },
    });
    expect(r.mode).toBe("gregorio_gated");
    expect(r.usedGregorio).toBe(true);
    expect(r.reachedMql).toBe(45);
  });

  it("gregorio gated mode falls back to stage column when umbral no aplica", () => {
    const r = resolveReachedEnrichment({
      ...base,
      timelineMode: false,
      stage: { mql: 12, sql: 4, cita: 2 },
      preRejectMql: 5,
    });
    expect(r.usedGregorio).toBe(false);
    expect(r.reachedMql).toBe(12);
    expect(r.reachedSql).toBe(4);
    expect(r.reachedCita).toBe(2);
  });
});
