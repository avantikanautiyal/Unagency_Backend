import { createGovernancePolicyForProductMode } from "../../../src/platform/os/governance/governance-policy-by-product-mode";
import {
  buildWorkflowFollowUpFromMetadata,
} from "../../../src/platform/api/services/workflow-follow-up";
import type { ServiceContextWorkflow } from "../../../src/platform/os/brief/engine/service-context-classifier";

describe("governance-policy-by-product-mode", () => {
  it("relaxes human review threshold in AI mode", () => {
    const ai = createGovernancePolicyForProductMode({
      organizationId: "org_1",
      productMode: "ai",
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    const human = createGovernancePolicyForProductMode({
      organizationId: "org_1",
      productMode: "human",
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    expect(ai.rules.humanReviewRiskThreshold).toBeGreaterThan(
      human.rules.humanReviewRiskThreshold
    );
    expect(ai.rules.approveMinOverallScore).toBeLessThan(
      human.rules.approveMinOverallScore
    );
  });
});

describe("workflow-follow-up", () => {
  it("builds follow-up payload from compound workflow metadata", () => {
    const workflow: ServiceContextWorkflow = {
      parentProjectTitle: "Brand Launch Kit",
      acknowledgment: "We'll start with your logo first.",
      phases: [
        {
          role: "primary",
          label: "Logo Design",
          selection: { service: "design", label: "Logo Design" },
        },
        {
          role: "follow_up",
          label: "Brochure",
          promptSnippet: "Create a brochure using the approved logo",
          selection: {
            service: "content",
            subtype: "social",
            label: "Social Media Brochure",
          },
        },
      ],
    };
    const payload = buildWorkflowFollowUpFromMetadata({
      executionId: "exec_1",
      prompt: "logo then brochure",
      workflow,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    expect(payload?.followUp.label).toBe("Social Media Brochure");
    expect(payload?.prompt).toContain("brochure");
  });
});
