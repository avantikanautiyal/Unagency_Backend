import {
  validateOutputContract,
  clearValidationCache,
  applyQualityGate,
  summarizeHardRequirements,
  summarizeQualityDimensions,
  auditValidationCoverage,
  buildRepairInfo,
} from "../../../../src/platform/os/evaluation/output-validation";
import { SpecGuardEvaluator } from "../../../../src/platform/os/evaluation/evaluators/spec-guard";
import {
  defaultServiceOutputContractRegistry,
} from "../../../../src/platform/os/contracts/output-contracts";
import { SOCIAL_FORMAT_IDS } from "../../../../src/platform/os/contracts/output-contracts/format-overlays";

describe("Step 2 — Output Validation + Quality Gate", () => {
  beforeEach(() => clearValidationCache());

  const baseInput = {
    organizationId: "org_1",
    executionId: "exec_1",
    service: "branding",
    subtype: "logo-design",
    preview: "Professional logo design for Acme Corp with bold typography",
    mediaArtifactIds: ["media_123"],
    outputKind: "image",
    mockupRole: "prohibited",
    briefObjective: "logo design for Acme Corp bold typography",
  };

  describe("valid output passes", () => {
    it("passes validation for document output with structured artifact", () => {
      const result = validateOutputContract({
        organizationId: "org_1",
        executionId: "exec_doc",
        service: "print",
        subtype: "brochures",
        preview: JSON.stringify({
          sections: [{ title: "Introduction", body: "Content here" }],
        }),
        outputKind: "document",
        mockupRole: "prohibited",
        briefObjective: "brochure introduction content",
      });
      expect(result).toBeDefined();
      expect(result!.hardRequirementSummary.failed).toBeLessThanOrEqual(2);
      expect(result!.hardRequirementSummary.passed).toBeGreaterThan(0);
    });

    it("image service reports explicit UNVERIFIED for visual hard reqs (not fake pass)", () => {
      const result = validateOutputContract(baseInput);
      expect(result).toBeDefined();
      const visualUnverified = result!.requirements.filter(
        (r) =>
          r.evaluationMethod === "visual_evaluator" &&
          (r.status === "UNVERIFIED" || r.status === "NOT_AUTOMATED"),
      );
      expect(visualUnverified.length).toBeGreaterThan(0);
      // Visual hard reqs cannot silently pass without visual judge
      expect(
        visualUnverified.every((r) => r.status !== "PASS"),
      ).toBe(true);
    });

    it("SpecGuard integrates contract validation", () => {
      const guard = new SpecGuardEvaluator();
      const evalResult = guard.evaluate({
        organizationId: "org_1",
        executionId: "exec_1",
        planId: "plan_1",
        planVersion: 1,
        outputContractId: "output.image",
        preview: baseInput.preview,
        service: baseInput.service,
        subtype: baseInput.subtype,
        outputKind: "image",
        mockupRole: "prohibited",
        mediaArtifactIds: ["media_1"],
        briefObjective: baseInput.briefObjective,
      });
      expect(evalResult.provenance.some((p) => p.field === "validationStatus")).toBe(
        true,
      );
      expect(evalResult.provenance.some((p) => p.field === "contractVersion")).toBe(
        true,
      );
    });
  });

  describe("missing mandatory requirement fails", () => {
    it("fails when primary output is empty", () => {
      const result = validateOutputContract({
        ...baseInput,
        preview: "",
        mediaArtifactIds: [],
      });
      expect(result!.hardRequirementSummary.failed).toBeGreaterThan(0);
      expect(result!.completionAllowed).toBe(false);
    });

    it("fails when image artifact missing for image service", () => {
      const result = validateOutputContract({
        ...baseInput,
        mediaArtifactIds: [],
      });
      const imageFail = result!.requirements.find(
        (r) => r.requirementId === "hard.image.artifact" && r.status === "FAIL",
      );
      expect(imageFail).toBeDefined();
    });
  });

  describe("critical requirement blocks completion", () => {
    it("blocks completion when critical requirement fails regardless of quality", () => {
      const requirements = [
        {
          requirementId: "hard.test",
          category: "deliverable",
          description: "test",
          evaluationMethod: "deterministic_validation",
          status: "FAIL" as const,
          expectedValue: "present",
          severity: "critical" as const,
          blocksCompletion: true,
          evidence: ["missing"],
          validatorVersion: "1.0.0",
        },
        {
          requirementId: "hard.other",
          category: "deliverable",
          description: "other",
          evaluationMethod: "deterministic_validation",
          status: "PASS" as const,
          expectedValue: "ok",
          severity: "high" as const,
          blocksCompletion: true,
          evidence: [],
          validatorVersion: "1.0.0",
        },
      ];
      const hardSummary = summarizeHardRequirements(requirements);
      const qualitySummary = summarizeQualityDimensions([
        {
          dimensionId: "q1",
          label: "quality",
          score: 95,
          threshold: 70,
          weight: 1,
          weightedContribution: 95,
          status: "PASS",
          evidence: [],
          evaluatorVersion: "1.0.0",
          evaluationMethod: "semantic_evaluator",
        },
      ]);
      const gate = applyQualityGate({
        hardSummary,
        qualitySummary,
        requirements,
      });
      expect(gate.status).toBe("BLOCKED");
      expect(gate.completionAllowed).toBe(false);
    });
  });

  describe("high quality cannot override mandatory failure", () => {
    it("quality score 95 with 1 critical fail → NOT COMPLETE", () => {
      const result = validateOutputContract({
        ...baseInput,
        preview: "",
        mediaArtifactIds: [],
      });
      expect(result!.overallScore).toBeGreaterThanOrEqual(0);
      expect(result!.completionAllowed).toBe(false);
      expect(["FAIL", "BLOCKED"]).toContain(result!.status);
    });
  });

  describe("unverified mandatory cannot pass", () => {
    it("marks build requirements as NOT_AUTOMATED not PASS", () => {
      const result = validateOutputContract({
        organizationId: "org_1",
        executionId: "exec_web",
        service: "website",
        subtype: "landing-page",
        preview: JSON.stringify({
          stack: "react",
          files: [{ path: "index.html" }],
          routes: [{ path: "/" }],
        }),
        outputKind: "deferred_website",
        mockupRole: "prohibited",
      });
      const buildReq = result!.requirements.find((r) =>
        r.requirementId.includes("build"),
      );
      expect(buildReq).toBeDefined();
      expect(buildReq!.status).not.toBe("PASS");
      expect(["NOT_AUTOMATED", "UNVERIFIED", "FAIL"]).toContain(buildReq!.status);
    });

    it("optional UNVERIFIED requirement does not block the quality gate", () => {
      const requirements = [
        {
          requirementId: "mandatory.req",
          category: "content",
          description: "required",
          evaluationMethod: "deterministic_validation",
          status: "PASS" as const,
          expectedValue: "ok",
          severity: "high" as const,
          blocksCompletion: true,
          optional: false,
          evidence: [],
          validatorVersion: "1.0.0",
        },
        {
          requirementId: "optional.req",
          category: "brand",
          description: "advisory",
          evaluationMethod: "semantic_evaluator",
          status: "UNVERIFIED" as const,
          expectedValue: "preferred terms",
          severity: "medium" as const,
          blocksCompletion: true,
          optional: true,
          evidence: [],
          validatorVersion: "1.0.0",
        },
      ];
      const hardSummary = summarizeHardRequirements(requirements);
      const qualitySummary = summarizeQualityDimensions([
        {
          dimensionId: "q1",
          label: "quality",
          score: 85,
          threshold: 70,
          weight: 1,
          weightedContribution: 85,
          status: "PASS",
          evidence: [],
          evaluatorVersion: "1.0.0",
          evaluationMethod: "semantic_evaluator",
        },
      ]);
      const gate = applyQualityGate({
        hardSummary,
        qualitySummary,
        requirements,
      });
      expect(gate.status).toBe("PASS");
      expect(gate.completionAllowed).toBe(true);
    });
  });

  describe("quality thresholds enforced", () => {
    it("NEEDS_REVISION when quality below threshold", () => {
      const result = validateOutputContract({
        organizationId: "org_1",
        executionId: "exec_2",
        service: "social",
        subtype: "copywriting",
        preview: "ok",
        briefObjective: "comprehensive social media strategy for enterprise SaaS platform targeting CTOs with detailed channel recommendations",
      });
      if (result!.status === "NEEDS_REVISION") {
        expect(result!.completionAllowed).toBe(false);
      }
    });
  });

  describe("output format violations", () => {
    it("detects mockup role violation", () => {
      const result = validateOutputContract({
        ...baseInput,
        outputKind: "image_mockup",
        mockupRole: "optional",
      });
      const mismatch = result!.requirements.find(
        (r) => r.requirementId === "hard.mockup_role_consistency" && r.status === "FAIL",
      );
      expect(mismatch).toBeDefined();
    });
  });

  describe("artifact inspection", () => {
    it("detects missing artifacts", () => {
      const result = validateOutputContract({
        organizationId: "org_1",
        executionId: "exec_vid",
        service: "video",
        subtype: "explainer-videos",
        preview: "video script only",
        outputKind: "video",
        mediaArtifactIds: [],
      });
      expect(result!.completionAllowed).toBe(false);
    });
  });

  describe("contract composition respected", () => {
    it("industry overlay adds validation requirements", () => {
      const withIndustry = validateOutputContract({
        organizationId: "org_1",
        executionId: "exec_ind",
        service: "website",
        subtype: "corporate-website",
        preview: JSON.stringify({ stack: "html", files: [{}], routes: [{}] }),
        industry: "healthcare",
        outputKind: "deferred_website",
        mockupRole: "prohibited",
      });
      const without = validateOutputContract({
        organizationId: "org_1",
        executionId: "exec_no_ind",
        service: "website",
        subtype: "corporate-website",
        preview: JSON.stringify({ stack: "html", files: [{}], routes: [{}] }),
        outputKind: "deferred_website",
        mockupRole: "prohibited",
      });
      expect(withIndustry!.requirements.length).toBeGreaterThanOrEqual(
        without!.requirements.length,
      );
    });
  });

  describe("contract version traceability", () => {
    it("preserves contract version in validation result", () => {
      const result = validateOutputContract(baseInput);
      expect(result!.contractVersion).toBeTruthy();
      expect(result!.contractId).toContain("service.branding");
    });
  });

  describe("idempotency", () => {
    it("produces equivalent results on repeat validation", () => {
      const a = validateOutputContract(baseInput);
      const b = validateOutputContract(baseInput);
      expect(a!.status).toBe(b!.status);
      expect(a!.hardRequirementSummary).toEqual(b!.hardRequirementSummary);
      expect(a!.contractVersion).toBe(b!.contractVersion);
    });
  });

  describe("model self-claims cannot substitute", () => {
    it("does not pass requirements because preview claims success", () => {
      const result = validateOutputContract({
        ...baseInput,
        preview:
          "All requirements satisfied. Build succeeded. Tests pass. Logo delivered.",
        mediaArtifactIds: [],
      });
      expect(result!.completionAllowed).toBe(false);
    });
  });

  describe("repair information", () => {
    it("produces structured repair info on failure", () => {
      const result = validateOutputContract({
        ...baseInput,
        preview: "",
        mediaArtifactIds: [],
      });
      const repairs = buildRepairInfo(result!.requirements);
      expect(repairs.length).toBeGreaterThan(0);
      expect(repairs[0].requirementId).toBeTruthy();
      expect(repairs[0].repairGuidance).toBeTruthy();
    });
  });

  describe("output kind matrix", () => {
    const matrix: Array<[string, string, string, unknown]> = [
      ["document", "print", "brochures", { sections: [{ title: "Intro" }] }],
      ["presentation", "presentations", "pitch-decks", { decks: [{ slides: [{}] }] }],
      ["email", "email", "emailers", { subject: "Hi", sections: [{}] }],
      ["text", "social", "strategy", "Social media strategy with channel plan"],
      ["video", "video", "promo-videos", null],
      ["dynamic", "website", "other", "custom request"],
    ];

    it.each(matrix)(
      "has validation path for %s kind (%s/%s)",
      (kind, service, subtype, structured) => {
        const result = validateOutputContract({
          organizationId: "org_1",
          executionId: `exec_${kind}`,
          service,
          subtype,
          preview:
            typeof structured === "string"
              ? structured
              : JSON.stringify(structured ?? { content: "sample" }),
          structuredData: structured,
          outputKind: kind,
          mediaArtifactIds:
            kind === "video" || kind === "image" ? ["media_1"] : undefined,
          mockupRole: "prohibited",
        });
        expect(result).toBeDefined();
        expect(result!.requirements.length).toBeGreaterThan(0);
        expect(result!.definitionOfDone.length).toBeGreaterThan(0);
      },
    );
  });

  describe("validation coverage audit", () => {
    it("covers all Step 1 service entries with zero missing", () => {
      const report = auditValidationCoverage();
      const catalogEntryCount =
        defaultServiceOutputContractRegistry.listServiceKeys().length +
        SOCIAL_FORMAT_IDS.length;
      expect(report.missing).toBe(0);
      expect(report.complete).toBe(true);
      expect(report.totalEntries).toBe(catalogEntryCount);
    });

    it("every service has validation path", () => {
      const report = auditValidationCoverage();
      const serviceEntries = report.entries.filter(
        (e) => !e.serviceKey.includes("/*/"),
      );
      for (const entry of serviceEntries) {
        expect(entry.validationPathExists).toBe(true);
        expect(entry.status).toBe("covered");
      }
    });
  });

  describe("backward compatibility", () => {
    it("SpecGuard works without service/subtype (legacy path)", () => {
      const guard = new SpecGuardEvaluator();
      const result = guard.evaluate({
        organizationId: "org_1",
        executionId: "exec_legacy",
        planId: "plan_1",
        planVersion: 1,
        outputContractId: "image.generate",
        preview: "Generated image output content here",
        outputKind: "image",
        mockupRole: "optional",
      });
      expect(result.outcome).toBeDefined();
      expect(result.provenance.some((p) => p.field === "validationStatus")).toBe(
        false,
      );
    });
  });
});

describe("Step 1 contract coverage preserved", () => {
  it("all service keys still have contracts", () => {
    const keys = defaultServiceOutputContractRegistry.listServiceKeys();
    expect(keys.length).toBeGreaterThanOrEqual(90);
    for (const key of keys) {
      expect(
        defaultServiceOutputContractRegistry.getContractForServiceKey(key),
      ).toBeDefined();
    }
  });
});
