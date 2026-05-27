import { describe, expect, it } from "vitest";
import {
  accumulateSnapshotTier,
  buildStatusMapFromKommo,
  classifyKommoStageTier,
  getStageFromKommoStatus,
  inferStageFromStatusName,
  newClientSnapshot,
  toCumulativeStageCounts,
} from "../config/kommoStageMap.js";

describe("kommoStageMap", () => {
  it("rechazados cuentan como conversación (volumen)", () => {
    const stage = toCumulativeStageCounts(inferStageFromStatusName("Rechazados"));
    expect(stage.conversaciones).toBe(1);
    expect(stage.mql).toBe(0);
    expect(stage.sql).toBe(0);
  });

  it("snapshot DOS HOGARES: 99 leads, 4 reached MQL (como HTML control)", () => {
    const tiers: Array<ReturnType<typeof classifyKommoStageTier>> = [
      ...Array.from({ length: 81 }, () => "rejected" as const),
      ...Array.from({ length: 14 }, () => "entrada" as const),
      ...Array.from({ length: 3 }, () => "mql" as const),
      ...Array.from({ length: 1 }, () => "sql" as const),
    ];
    const snap = tiers.reduce((acc, tier) => accumulateSnapshotTier(acc, tier), newClientSnapshot("DOS HOGARES"));
    expect(snap.leads).toBe(99);
    expect(snap.reachedMql).toBe(4);
    expect(snap.reachedSql).toBe(1);
    expect(snap.reachedCita).toBe(0);
  });

  it("usa clave pipeline:status para etapas compartidas", () => {
    const map = buildStatusMapFromKommo([
      { id: 143, name: "RECHAZADO", pipeline_id: 10970835 },
      { id: 104308167, name: "Leads por calificar", pipeline_id: 13519787 },
      { id: 104308379, name: "MQL", pipeline_id: 13519787 },
    ]);
    const porCalificar = getStageFromKommoStatus(104308167, 13519787, map);
    expect(porCalificar.conversaciones).toBe(1);
    expect(porCalificar.mql).toBe(0);
    const mql = getStageFromKommoStatus(104308379, 13519787, map);
    expect(mql.conversaciones).toBe(1);
    expect(mql.mql).toBe(1);
  });
});
