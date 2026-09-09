/**
 * Phase B — Production release gate + compliance + delivery authorization.
 */

import {
  evaluateProductionReleaseGate,
  resolveProductionExportFormats,
} from "../../../src/platform/config/format-production-spec";
import {
  evaluateDeliverableCompliance,
  extractSemanticSignals,
  resolveExecutionSpecification,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import { resolveSelectableDownloadFormats } from "../../../src/platform/config/service-output-map";
import { DeliveryAuthorizationService } from "../../../src/platform/os/delivery/authorization/delivery-authorization";
import type { IArtifactVersionStore } from "../../../src/platform/os/delivery/artifact/artifact-version-store";

describe("production release gate", () => {
  it("blocks R/H placements without confirmed override", () => {
    const gate = evaluateProductionReleaseGate({
      platform: "facebook",
      formatId: "page-cover-video",
    });
    expect(gate.allowed).toBe(false);
    expect(gate.status).toBe("BLOCK");
    expect(gate.rule?.status).toBe("H");
  });

  it("allows R/H when confirmedOverride is set", () => {
    const gate = evaluateProductionReleaseGate({
      platform: "tiktok",
      formatId: "story",
      confirmedOverride: true,
    });
    expect(gate.allowed).toBe(true);
    expect(gate.status).toBe("WARN");
  });

  it("blocks V canvas mismatch", () => {
    const gate = evaluateProductionReleaseGate({
      placementId: "linkedin.ad.single-image.landscape",
      generatedWidth: 1080,
      generatedHeight: 1080,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.status).toBe("BLOCK");
    expect(gate.checks.some((c) => c.id === "production.canvas_dimensions")).toBe(
      true,
    );
  });

  it("warns but allows D canvas drift", () => {
    const gate = evaluateProductionReleaseGate({
      platform: "instagram",
      formatId: "reels",
      generatedWidth: 1024,
      generatedHeight: 1792,
    });
    expect(gate.allowed).toBe(true);
    expect(gate.status).toBe("WARN");
  });

  it("passes when V canvas matches", () => {
    const gate = evaluateProductionReleaseGate({
      placementId: "youtube.channel-banner",
      generatedWidth: 2560,
      generatedHeight: 1440,
    });
    expect(gate.allowed).toBe(true);
    expect(gate.status).toBe("PASS");
  });
});

describe("deliverable compliance + production gate", () => {
  function socialSpec(platform: string, format: string, message = "Create asset") {
    return resolveExecutionSpecification({
      message,
      signals: extractSemanticSignals(message),
      action: "CREATE_NEW",
      requirements: [],
      service: "social",
      subtype: "content-design",
      platform,
      format,
    });
  }

  it("hard-fails requirement compliance for Hold page-cover-video", () => {
    const spec = socialSpec("facebook", "page-cover-video");
    const report = evaluateDeliverableCompliance({
      spec,
      presentFormats: ["PNG"],
      production: { platform: "facebook", formatId: "page-cover-video" },
    });
    expect(report.productionReleaseBlocked).toBe(true);
    expect(report.requirementComplianceStatus).toBe(
      "REQUIREMENT_COMPLIANCE_FAILURE",
    );
    expect(
      report.results.some(
        (r) => r.checkId === "production.release_authority" && r.status === "FAIL",
      ),
    ).toBe(true);
  });

  it("hard-fails V dimension mismatch", () => {
    const spec = socialSpec("linkedin", "linkedin.ad.single-image.square");
    const report = evaluateDeliverableCompliance({
      spec,
      presentFormats: ["PNG"],
      generatedWidth: 1080,
      generatedHeight: 1080,
      production: {
        platform: "linkedin",
        formatId: "linkedin.ad.single-image.square",
      },
    });
    expect(report.productionReleaseBlocked).toBe(true);
    expect(report.requirementComplianceStatus).toBe(
      "REQUIREMENT_COMPLIANCE_FAILURE",
    );
  });

  it("treats D canvas drift as soft failure (not requirement-blocking)", () => {
    const spec = socialSpec("instagram", "reels");
    const report = evaluateDeliverableCompliance({
      spec,
      presentFormats: spec.deliverables.map((d) => d.format),
      generatedWidth: 1024,
      generatedHeight: 1792,
      production: { platform: "instagram", formatId: "reels" },
    });
    expect(report.productionReleaseBlocked).toBe(false);
    expect(report.requirementComplianceStatus).toBe("COMPLIANT");
    expect(report.overallStatus).toBe("COMPLIANT");
    const canvas = report.results.find(
      (r) => r.checkId === "production.canvas_dimensions",
    );
    expect(canvas?.status).toBe("FAIL");
    expect(canvas?.softFailure).toBe(true);
  });
});

describe("download formats ∩ Spec export", () => {
  it("narrows selectable formats to Spec export list", () => {
    const productionFormats = resolveProductionExportFormats({
      placementId: "linkedin.ad.single-image.landscape",
    });
    expect(productionFormats).toEqual(["jpg", "png", "gif"]);

    const selectable = resolveSelectableDownloadFormats({
      spec: {
        supportedDownloadFormats: ["png", "jpg", "pdf", "svg"],
        defaultDownloadFormat: "png",
      },
      mimeType: "image/png",
      productionExportFormats: productionFormats,
    });
    expect(selectable.sort()).toEqual(["jpg", "png"]);
  });
});

describe("delivery authorization production gate", () => {
  function mockStore(approvalState: "APPROVED" | "PENDING"): IArtifactVersionStore {
    return {
      implementationStatus: "implemented",
      async putVersion() {
        return undefined as never;
      },
      async getVersion() {
        return {
          artifactId: "art1",
          version: 1,
          organizationId: "org1",
          executionId: "exec1",
          approvalState,
          createdAt: "2026-01-01T00:00:00.000Z",
        } as never;
      },
      async listVersions() {
        return [];
      },
    } as IArtifactVersionStore;
  }

  it("denies delivery for Hold placement even when approved", async () => {
    const authz = new DeliveryAuthorizationService(mockStore("APPROVED"));
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
    expect(result.reason).toMatch(/PRODUCTION_RELEASE_HOLD|status H/i);
  });

  it("allows delivery for D placement when approved", async () => {
    const authz = new DeliveryAuthorizationService(mockStore("APPROVED"));
    const result = await authz.authorizeAsync({
      organizationId: "org1",
      artifactId: "art1",
      artifactVersion: 1,
      executionId: "exec1",
      destination: "export",
      productionGate: {
        platform: "instagram",
        formatId: "reels",
        generatedWidth: 1080,
        generatedHeight: 1920,
      },
    });
    expect(result.authorized).toBe(true);
  });
});
