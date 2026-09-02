import {
  SERVICE_OUTPUT_MAP,
  validateServiceOutputContractInvariants,
} from "../../../../src/platform/config/service-output-map";
import {
  defaultServiceOutputContractRegistry,
  enumerateServiceKeys,
  composeEffectiveOutputContract,
  detectRequirementConflicts,
  brandRequirementsFromContext,
  userTaskRequirementsFromBrief,
  auditOutputContractCoverage,
  formatCoverageReportSummary,
  KIND_TEMPLATES,
  INDUSTRY_OVERLAYS,
  SOCIAL_FORMAT_IDS,
  OUTPUT_CONTRACT_SYSTEM_VERSION,
} from "../../../../src/platform/os/contracts/output-contracts";

describe("Output Contract System — Step 1", () => {
  const registry = defaultServiceOutputContractRegistry;

  describe("coverage audit", () => {
    it("covers every SERVICE_OUTPUT_MAP entry (non-wildcard)", () => {
      const mapKeys = Object.keys(SERVICE_OUTPUT_MAP).filter(
        (k) => !k.endsWith("/*"),
      );
      const registryKeys = registry.listServiceKeys();
      expect([...registryKeys].sort()).toEqual([...mapKeys].sort());
    });

    it("reports complete coverage with no missing services", () => {
      const report = registry.auditCoverage();
      expect(report.missing).toBe(0);
      expect(report.entries.filter((e) => e.status === "missing")).toHaveLength(
        0,
      );
    });

    it("every service contract has Definition of Done", () => {
      for (const key of registry.listServiceKeys()) {
        const contract = registry.getContractForServiceKey(key);
        expect(contract).toBeDefined();
        expect(contract!.definitionOfDone.mandatoryChecks.length).toBeGreaterThan(
          0,
        );
        expect(contract!.definitionOfDone.deliveryChecks.length).toBeGreaterThan(
          0,
        );
      }
    });

    it("every service distinguishes hard vs quality requirements", () => {
      for (const key of registry.listServiceKeys()) {
        const contract = registry.getContractForServiceKey(key)!;
        expect(contract.hardRequirements.length).toBeGreaterThan(0);
        expect(
          contract.hardRequirements.every((r) => r.class === "hard"),
        ).toBe(true);
        expect(contract.qualityRequirements.length).toBeGreaterThan(0);
      }
    });

    it("every requirement has an evaluation method", () => {
      for (const key of registry.listServiceKeys()) {
        const contract = registry.getContractForServiceKey(key)!;
        for (const req of contract.hardRequirements) {
          expect(req.evaluation.method).toBeTruthy();
          expect(req.evaluation.expectedResult).toBeTruthy();
          expect(req.evaluation.severity).toBeTruthy();
        }
        for (const dim of contract.qualityRequirements) {
          expect(dim.evaluationMethod).toBeTruthy();
          expect(dim.threshold).toBeGreaterThan(0);
        }
      }
    });

    it("every contract defines failure conditions and delivery format", () => {
      for (const key of registry.listServiceKeys()) {
        const contract = registry.getContractForServiceKey(key)!;
        expect(contract.failureConditions.length).toBeGreaterThan(0);
        expect(contract.deliverables.primaryArtifact).toBeTruthy();
        expect(contract.deliverables.supportedFormats).toBeDefined();
      }
    });

    it("covers all 58 social format overlays", () => {
      for (const formatId of SOCIAL_FORMAT_IDS) {
        const contract = registry.getServiceContract(
          "social",
          "content-design",
          { format: formatId, platform: "instagram" },
        );
        expect(contract).toBeDefined();
        expect(
          contract!.hardRequirements.some((r) => r.id.includes(formatId)),
        ).toBe(true);
      }
    });
  });

  describe("kind templates", () => {
    it("has a template for every ServiceOutputKind", () => {
      const kinds = new Set(
        Object.values(SERVICE_OUTPUT_MAP).map((s) => s.kind),
      );
      for (const kind of kinds) {
        expect(KIND_TEMPLATES[kind]).toBeDefined();
        expect(KIND_TEMPLATES[kind].hardRequirements.length).toBeGreaterThan(0);
      }
    });

    it("deferred_website has website-specific hard requirements", () => {
      const template = KIND_TEMPLATES.deferred_website;
      expect(
        template.hardRequirements.some((r) => r.id.includes("website.build")),
      ).toBe(true);
      expect(
        template.qualityDimensions.some((d) => d.id.includes("accessibility")),
      ).toBe(true);
    });

    it("dynamic kind requires modality resolution", () => {
      const template = KIND_TEMPLATES.dynamic;
      expect(
        template.hardRequirements.some(
          (r) => r.id === "hard.dynamic_modality_resolved",
        ),
      ).toBe(true);
    });
  });

  describe("contract composition", () => {
    it("composes effective contract with traceability", () => {
      const effective = composeEffectiveOutputContract({
        service: "website",
        subtype: "landing-page",
        industry: "healthcare",
        brandRequirements: brandRequirementsFromContext({
          avoidTerms: ["cheap"],
          colors: ["#003366"],
        }),
        userTaskRequirements: userTaskRequirementsFromBrief({
          prompt: "Landing page for telehealth app",
        }),
      });
      expect(effective).toBeDefined();
      expect(effective!.identity.systemVersion).toBe(
        OUTPUT_CONTRACT_SYSTEM_VERSION,
      );
      expect(effective!.identity.layerVersions.length).toBeGreaterThanOrEqual(4);
      expect(effective!.compositionTrace.length).toBeGreaterThanOrEqual(4);
      expect(effective!.industryOverlayId).toBe("healthcare");
      expect(
        effective!.hardRequirements.some((r) => r.id === "brand.avoid_terms"),
      ).toBe(true);
    });

    it("resolves video kind for reels format", () => {
      const effective = composeEffectiveOutputContract({
        service: "social",
        subtype: "content-design",
        format: "reels",
        platform: "instagram",
      });
      expect(effective!.outputKind).toBe("video");
      expect(
        effective!.hardRequirements.some((r) =>
          r.id.includes("video_artifact"),
        ),
      ).toBe(true);
    });

    it("detects requirement conflicts deterministically", () => {
      const conflicts = detectRequirementConflicts([
        {
          id: "test.req",
          class: "hard",
          category: "content",
          description: "A",
          evaluation: {
            method: "deterministic_validation",
            expectedResult: "foo",
            severity: "high",
            blocksCompletion: true,
          },
        },
        {
          id: "test.req",
          class: "hard",
          category: "content",
          description: "B",
          evaluation: {
            method: "deterministic_validation",
            expectedResult: "bar",
            severity: "high",
            blocksCompletion: true,
          },
        },
      ]);
      expect(conflicts.length).toBe(1);
    });

    it("does not silently pass unautomated requirements", () => {
      const contract = registry.getContractForServiceKey(
        "website/corporate-website",
      )!;
      const semanticReqs = contract.hardRequirements.filter(
        (r) => r.evaluation.method === "semantic_evaluator",
      );
      expect(semanticReqs.length).toBeGreaterThan(0);
      for (const req of semanticReqs) {
        expect(req.evaluation.method).not.toBe("deterministic_validation");
      }
    });
  });

  describe("industry overlays", () => {
    it("has extensible industry overlay scaffold", () => {
      expect(Object.keys(INDUSTRY_OVERLAYS).length).toBeGreaterThanOrEqual(5);
    });

    it("healthcare overlay adds requirements without replacing base", () => {
      const base = registry.getContractForServiceKey("website/corporate-website")!;
      const effective = composeEffectiveOutputContract({
        service: "website",
        subtype: "corporate-website",
        industry: "healthcare",
      })!;
      expect(effective.hardRequirements.length).toBeGreaterThan(
        base.hardRequirements.length,
      );
      expect(
        base.hardRequirements.every((r) =>
          effective.hardRequirements.some((e) => e.id === r.id),
        ),
      ).toBe(true);
    });
  });

  describe("versioning", () => {
    it("effective contract identity is deterministic for same inputs", () => {
      const input = {
        service: "branding",
        subtype: "logo-design",
        industry: "fashion",
      };
      const a = composeEffectiveOutputContract(input)!;
      const b = composeEffectiveOutputContract(input)!;
      expect(a.identity.effectiveContractId).toBe(b.identity.effectiveContractId);
      expect(a.identity.serviceKey).toBe("branding/logo-design");
    });
  });

  describe("backward compatibility", () => {
    it("SERVICE_OUTPUT_MAP invariants still pass", () => {
      for (const [key, spec] of Object.entries(SERVICE_OUTPUT_MAP)) {
        const violations = validateServiceOutputContractInvariants(spec);
        expect({ key, violations }).toEqual({ key, violations: [] });
      }
    });

    it("enumerateServiceKeys matches map non-wildcard keys", () => {
      expect(enumerateServiceKeys().length).toBe(
        Object.keys(SERVICE_OUTPUT_MAP).filter((k) => !k.endsWith("/*")).length,
      );
    });
  });

  describe("coverage report formatting", () => {
    it("generates human-readable audit summary", () => {
      const report = auditOutputContractCoverage(registry);
      const summary = formatCoverageReportSummary(report);
      expect(summary).toContain("Output Contract Coverage Audit");
      expect(summary).toContain(`Total: ${report.totalServices}`);
    });
  });
});
