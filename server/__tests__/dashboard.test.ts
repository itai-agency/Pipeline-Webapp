import { describe, expect, it } from "vitest";
import { getStaticSnapshot } from "../services/staticFallback.js";
import type { DashboardSnapshotDto } from "../../shared/types/dashboard.js";

describe("static fallback snapshot", () => {
  it("returns daily rows with required pipeline fields", () => {
    const snapshot: DashboardSnapshotDto = getStaticSnapshot();
    expect(snapshot.daily.length).toBeGreaterThan(0);
    const first = snapshot.daily[0];
    expect(first).toHaveProperty("CLIENTE");
    expect(first).toHaveProperty("CONVERSACIONES");
    expect(first).toHaveProperty("MQL");
    expect(snapshot.metaSpend.length).toBeGreaterThan(0);
    expect(snapshot.sdrHistory.length).toBeGreaterThan(0);
    expect(snapshot.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("dashboard snapshot shape", () => {
  it("meta spend rows include account metadata", () => {
    const snapshot = getStaticSnapshot();
    const row = snapshot.metaSpend[0];
    expect(row.accountId).toMatch(/^act_/);
    expect(row.spend).toBeGreaterThanOrEqual(0);
  });
});
