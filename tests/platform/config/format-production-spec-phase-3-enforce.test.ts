/**
 * Phase 3 — Enforcement parity: hygiene decisions, required Spec gate, export intersect.
 */

import {
  evaluateHygieneEvidence,
  evaluateProductionReleaseGate,
  isDecisionDeliveryBlocked,
  resolveSpecAwareDownloadFormats,
} from "../../../src/platform/config/format-production-spec";
import { isHardComplianceFailure } from "../../../src/platform/collaboration/conversational-task-intelligence/production-compliance";
import {
  evaluateDeliverableCompliance,
  extractSemanticSignals,
  resolveExecutionSpecification,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import { DeliveryAuthorizationService } from "../../../src/platform/os/delivery/authorization/delivery-authorization";
import type { IArtifactVersionStore } from "../../../src/platform/os/delivery/artifact/artifact-version-store";
import {
  applyQualityGate,
  summarizeHardRequirements,
  summarizeQualityDimensions,
} from "../../../src/platform/os/evaluation/output-validation/quality-gate";

describe("Phase 3 — release decision mapping", () => {
  it("HOLDs R/H without override and soft-path outputs", () => {
    const hold = evaluateProductionReleaseGate({
      platform: "facebook",
      formatId: "page-cover-video",
    });
    expect(hold.decision).toBe("HOLD");
    expect(hold.allowed).toBe(false);

    const soft = evaluateProductionReleaseGate({
      service: "social",
      subtype: "content-design",
      productionReleaseEligible: false,
    });
    expect(soft.decision).toBe("HOLD");
    expect(soft.allowed).toBe(false);
  });

  it("REVISEs measured Gate hygiene failures and REVIEWs unresolved Gates", () => {
    const revise = evaluateProductionReleaseGate({
      service: "social",
      subtype: "content-design",
      failedGateHygieneIds: ["safe-zones"],
      evidencedGateHygieneIds: ["placement", "publication"],
    });
    expect(revise.decision).toBe("REVISE");
    expect(revise.allowed).toBe(false);
    expect(revise.checks.some((c) => c.id === "hygiene.safe-zones")).toBe(true);

    const review = evaluateProductionReleaseGate({
      service: "email",
      subtype: "emailers",
      // Leave "links" unevidenced → REVIEW
      evidencedGateHygieneIds: ["live-text", "fallback", "content"],
    });
    expect(review.hygiene.gateUnresolved).toContain("links");
    expect(review.decision).toBe("REVIEW");
    expect(review.allowed).toBe(true);
    expect(
      isDecisionDeliveryBlocked("REVIEW", { blockOnReview: true }),
    ).toBe(true);
  });

  it("PASSes when V canvas matches", () => {
    const gate = evaluateProductionReleaseGate({
      placementId: "youtube.channel-banner",
      generatedWidth: 2560,
      generatedHeight: 1440,
    });
    expect(gate.allowed).toBe(true);
    expect(["PASS", "REVIEW"]).toContain(gate.decision);
  });

  it("evaluateHygieneEvidence separates Gate vs Weighted", () => {
    const rule = evaluateProductionReleaseGate({
      service: "ads",
      subtype: "performance-ads",
    }).rule!;
    const summary = evaluateHygieneEvidence({
      rule,
      evidencedGateIds: rule.hygieneChecks
        ?.filter((c) => c.weight === "gate")
        .map((c) => c.id),
      weightedExceptionIds: ["experiment"],
    });
    expect(summary.gateUnresolved).toEqual([]);
    expect(summary.weightedExceptions).toContain("experiment");
  });
});

describe("Phase 3 — compliance + quality gate cannot override hard Spec fails", () => {
  it("surfaces productionReleaseDecision on deliverable compliance", () => {
    const message = "Create Instagram reels promo";
    const spec = resolveExecutionSpecification({
      message,
      signals: extractSemanticSignals(message),
      action: "CREATE_NEW",
      requirements: [],
      service: "social",
      platform: "instagram",
      format: "reels",
    });
    const report = evaluateDeliverableCompliance({
      spec,
      presentFormats: ["PNG"],
      generatedWidth: 1080,
      generatedHeight: 1920,
      production: { platform: "instagram", formatId: "reels" },
    });
    expect(report.productionReleaseDecision).toBeDefined();
    expect(report.productionReleaseBlocked).toBe(false);
  });

  it("treats hygiene Gate hard fails as hard compliance failures", () => {
    expect(
      isHardComplianceFailure({
        checkId: "hygiene.safe-zones",
        status: "FAIL",
      }),
    ).toBe(true);
    expect(
      isHardComplianceFailure({
        checkId: "hygiene.weighted.brand-upfront",
        status: "FAIL",
        softFailure: true,
      }),
    ).toBe(false);
  });

  it("quality score cannot override blocked hard requirements", () => {
    const requirements = [
      {
        requirementId: "production.canvas_dimensions",
        status: "FAIL" as const,
        severity: "critical" as const,
        blocksCompletion: true,
        evidence: ["canvas mismatch"],
        optional: false,
        evaluationMethod: "deterministic_validation" as const,
      },
    ];
    const hardSummary = summarizeHardRequirements(requirements);
    const qualitySummary = summarizeQualityDimensions([
      {
        dimensionId: "craft",
        status: "PASS",
        score: 95,
        threshold: 70,
        weight: 1,
        weightedContribution: 95,
      },
    ]);
    const result = applyQualityGate({
      hardSummary,
      qualitySummary,
      requirements,
      policy: {
        blockOnUnverifiedMandatory: true,
        allowNeedsRevision: true,
        minQualityScore: 70,
      },
    });
    expect(result.completionAllowed).toBe(false);
    expect(result.status).not.toBe("PASS");
    expect(hardSummary.blocksCompletion).toBe(true);
  });
});

describe("Phase 3 — delivery auth requires Spec gate when context exists", () => {
  function store(
    approvalState: "APPROVED" | "PENDING" = "APPROVED",
  ): IArtifactVersionStore {
    return {
      async getVersion() {
        return {
          artifactId: "art1",
          version: 1,
          organizationId: "org1",
          executionId: "exec1",
          approvalState,
          approvalReference: "apr1",
          planVersion: 1,
        } as never;
      },
      async putVersion() {
        return undefined as never;
      },
    };
  }

  it("denies when Spec gate blocks even if artifact is approved", async () => {
    const authz = new DeliveryAuthorizationService(store());
    const result = await authz.authorizeAsync({
      organizationId: "org1",
      artifactId: "art1",
      artifactVersion: 1,
      executionId: "exec1",
      destination: "export",
      productionGate: {
        platform: "facebook",
        formatId: "page-cover-video",
      },
    });
    expect(result.authorized).toBe(false);
    expect(result.reason).toMatch(/HOLD|confirm|status/i);
  });

  it("builds gate from executionMetadata when productionGate omitted", async () => {
    const authz = new DeliveryAuthorizationService(store());
    const result = await authz.authorizeAsync({
      organizationId: "org1",
      artifactId: "art1",
      artifactVersion: 1,
      executionId: "exec1",
      destination: "export",
      executionMetadata: {
        platform: "facebook",
        format: "page-cover-video",
        service: "social",
      },
    });
    expect(result.authorized).toBe(false);
  });

  it("authorizes when Spec gate PASSes", async () => {
    const authz = new DeliveryAuthorizationService(store());
    const result = await authz.authorizeAsync({
      organizationId: "org1",
      artifactId: "art1",
      artifactVersion: 1,
      executionId: "exec1",
      destination: "export",
      productionGate: {
        placementId: "youtube.channel-banner",
        generatedWidth: 2560,
        generatedHeight: 1440,
      },
    });
    expect(result.authorized).toBe(true);
  });
});

describe("Phase 3 — Spec-aware export formats", () => {
  it("intersects download formats with Spec export.formats", () => {
    const formats = resolveSpecAwareDownloadFormats({
      production: { service: "email", subtype: "emailers" },
      mimeType: "text/html",
      materializedFormats: ["html", "png", "pdf"],
    });
    expect(formats).toContain("html");
    expect(formats).not.toContain("pdf");
  });
});
