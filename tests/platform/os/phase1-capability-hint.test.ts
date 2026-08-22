/**
 * Phase 1 — capability-hint consumes StructuredBrief metadata.
 */

import { applyExplicitCapabilityHint } from "../../../src/platform/intelligence/integration/adapters/capability-hint";
import { asCapabilityId } from "../../../src/platform/intelligence/shared/identifiers";
import type { TaskIntelligenceReport } from "../../../src/platform/intelligence/task-intelligence/contracts/result";
import type { IntelligenceOsIntegrationRequest } from "../../../src/platform/intelligence/integration/contracts/request";

function baseTask(): TaskIntelligenceReport {
  return {
    requestId: "r1",
    structuredTask: {
      taskId: "t1" as never,
      title: "old",
      description: "old",
      capabilityId: asCapabilityId("text.chat"),
    },
    capabilityMap: {
      primary: asCapabilityId("text.chat"),
      requirements: [
        {
          capabilityId: asCapabilityId("text.chat"),
          label: "chat",
          priority: 1,
          confidence: 0.5,
          rationale: "old",
        },
      ],
      confidence: 0.5,
      rationale: "old",
    },
  } as TaskIntelligenceReport;
}

describe("Phase 1 — Brief → capability hint adapter", () => {
  it("prefers briefPrimaryCapability over prior task map", () => {
    const request = {
      requestId: "r1",
      rawPrompt: "campaign",
      metadata: {
        briefId: "brief_1",
        briefIntent: "campaign",
        briefPrimaryCapability: "text.generate",
        briefRequiredCapabilities: ["text.generate", "image.generate"],
      },
    } as IntelligenceOsIntegrationRequest;

    const next = applyExplicitCapabilityHint(baseTask(), request);
    expect(String(next.capabilityMap.primary)).toBe("text.generate");
    expect(String(next.structuredTask.capabilityId)).toBe("text.generate");
    expect(next.structuredTask.title).toContain("campaign");
    expect(
      next.capabilityMap.requirements.some(
        (r) => String(r.capabilityId) === "image.generate"
      )
    ).toBe(true);
  });
});
