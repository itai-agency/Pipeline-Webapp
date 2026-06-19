import { describe, expect, it } from "vitest";
import {
  sumMetaCaptacionActions,
  sumMetaFanpageConversations,
  sumMetaLeadActions,
} from "../services/meta.service.js";

describe("sumMetaCaptacionActions", () => {
  const actions = [
    { action_type: "leadgen_grouped", value: "2" },
    { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "10" },
    { action_type: "link_click", value: "99" },
  ];

  it("counts leadgen without fanpage", () => {
    expect(sumMetaLeadActions(actions)).toBe(2);
  });

  it("counts fanpage conversations", () => {
    expect(sumMetaFanpageConversations(actions)).toBe(10);
  });

  it("sums both for meta_spend_events.leads", () => {
    expect(sumMetaCaptacionActions(actions)).toBe(12);
  });
});
