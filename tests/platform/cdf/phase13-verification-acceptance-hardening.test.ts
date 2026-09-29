/**
 * Phase 13 — verification contract hardening + acceptance policy audit.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  deriveVisualVerificationRequirements,
  applyRenderedTextMatchPolicy,
  findVerificationCriterion,
} from "../../../src/platform/cdf/generation-validation/visual-verification-requirements";
import {
  evaluateStructuralCompositionCompliance,
  deriveBlocksCanonicalCompletion,
} from "../../../src/platform/cdf/generation-validation/structural-composition-validation";
import {
  resetVisualVerificationCapabilityClaimsForTests,
} from "../../../src/platform/cdf/generation-validation/visual-verification-capabilities";
import { resolveDeliverableCompositionContract } from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";

const contract = resolveDeliverableCompositionContract("social_creative")!;
const vreqs = deriveVisualVerificationRequirements(contract)!;

beforeEach(() => {
  resetVisualVerificationCapabilityClaimsForTests();
});

describe("Phase 13 — structured verification model", () => {
  it("every criterion carries structured acceptance fields", () => {
    for (const c of vreqs.criteria) {
      expect(c.verificationClass).toBeTruthy();
      expect(typeof c.required).toBe("boolean");
      expect(["block", "allow_with_hold"]).toContain(c.acceptanceOnUnmet);
      expect(c.satisfiedBy.length).toBeGreaterThan(0);
    }
    const presence = findVerificationCriterion(vreqs, "rendered_text_presence")!;
    expect(presence.textMatchPolicy).toBe("presence_only");
    const match = findVerificationCriterion(vreqs, "rendered_text_match")!;
    expect(match.textMatchPolicy).toBe("normalized_containment");
  });

  it("contract-level unverifiableRequiredAcceptance is not used", () => {
    expect(vreqs).not.toHaveProperty("unverifiableRequiredAcceptance");
  });
});

describe("Phase 13 — acceptance matrix A–J", () => {
  it("A — metadata only → UNVERIFIABLE → blocks when required", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        onImageCopy: { headline: "declared message" },
      },
      verificationRequirements: vreqs,
    });
    const presence = result.criteria.find(
      (c) => c.criterionId === "rendered_text_presence",
    )!;
    expect(presence.status).toBe("UNVERIFIABLE");
    expect(presence.proofLevel).toBe("declared");
    expect(presence.acceptanceOnUnmet).toBe("block");
    expect(result.blocksCanonicalCompletion).toBe(true);
  });

  it("B — verified expected text match → COMPLIANT for that criterion", () => {
    const expected = "Hello! We're Sunflower – a fresh approach to education";
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        expectedRenderedTexts: [expected],
        renderedTextProof: { extractedText: expected, source: "ocr" },
      },
      verificationRequirements: vreqs,
    });
    const match = result.criteria.find(
      (c) => c.criterionId === "rendered_text_match",
    )!;
    expect(match.status).toBe("COMPLIANT");
    expect(match.proofLevel).toBe("verified");
  });

  it("C — verified wrong text → NON_COMPLIANT", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        expectedRenderedTexts: [
          "Hello! We're Sunflower – a fresh approach to education",
        ],
        renderedTextProof: { extractedText: "Sunflower", source: "ocr" },
      },
      verificationRequirements: vreqs,
    });
    expect(
      result.criteria.find((c) => c.criterionId === "rendered_text_match")
        ?.status,
    ).toBe("NON_COMPLIANT");
    expect(result.blocksCanonicalCompletion).toBe(true);
  });

  it("D — empty OCR → NON_COMPLIANT when text required", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        renderedTextProof: { extractedText: "", source: "ocr" },
      },
      verificationRequirements: vreqs,
    });
    const presence = result.criteria.find(
      (c) => c.criterionId === "rendered_text_presence",
    )!;
    expect(presence.status).toBe("NON_COMPLIANT");
    expect(presence.proofLevel).toBe("verified");
    expect(result.blocksCanonicalCompletion).toBe(true);
  });

  it("E — OCR present + no expected text: presence COMPLIANT, match UNVERIFIABLE (not COMPLIANT)", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        renderedTextProof: {
          extractedText: "arbitrary OCR noise",
          source: "ocr",
        },
        expectedRenderedTexts: [],
      },
      verificationRequirements: vreqs,
    });
    const presence = result.criteria.find(
      (c) => c.criterionId === "rendered_text_presence",
    )!;
    const match = result.criteria.find(
      (c) => c.criterionId === "rendered_text_match",
    )!;
    expect(presence.status).toBe("COMPLIANT");
    expect(presence.proofLevel).toBe("verified");
    expect(match.status).toBe("UNVERIFIABLE");
    expect(match.proofLevel).toBe("verified");
    expect(match.status).not.toBe("COMPLIANT");
    // Presence satisfied; match hold does not block by policy
    expect(result.blocksCanonicalCompletion).toBe(false);
  });

  it("F — optional criterion UNVERIFIABLE does not block", () => {
    const hierarchy = resultCriterion(
      evaluateStructuralCompositionCompliance({
        contract,
        evidence: { hasPreviewAsset: true },
        verificationRequirements: vreqs,
      }),
      "hierarchy_realization",
    );
    expect(hierarchy?.required).toBe(false);
    expect(hierarchy?.status).toBe("UNVERIFIABLE");
    expect(hierarchy?.acceptanceOnUnmet).toBe("allow_with_hold");
    expect(
      deriveBlocksCanonicalCompletion(
        hierarchy ? [hierarchy] : [],
      ),
    ).toBe(false);
  });

  it("G — required visual criterion with no vision producer → UNVERIFIABLE", () => {
    const subject = resultCriterion(
      evaluateStructuralCompositionCompliance({
        contract,
        evidence: {
          renderedTextProof: {
            extractedText: "Hello! We're Sunflower – a fresh approach to education",
            source: "ocr",
          },
          expectedRenderedTexts: [
            "Hello! We're Sunflower – a fresh approach to education",
          ],
        },
        verificationRequirements: vreqs,
      }),
      "visual_subject",
    );
    expect(subject?.required).toBe(true);
    expect(subject?.status).toBe("UNVERIFIABLE");
    expect(subject?.acceptanceOnUnmet).toBe("allow_with_hold");
  });

  it("H — required visual with affirmative negative evidence → NON_COMPLIANT", () => {
    // Empty OCR is affirmative negative for rendered_text presence.
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        renderedTextProof: { extractedText: "   ", source: "ocr" },
      },
      verificationRequirements: vreqs,
    });
    expect(
      result.criteria.find((c) => c.criterionId === "rendered_text_presence")
        ?.status,
    ).toBe("NON_COMPLIANT");
  });

  it("I — contract_declared must not be confused with pixel verification", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        renderedTextProof: {
          extractedText: "Hello! We're Sunflower – a fresh approach to education",
          source: "ocr",
        },
        expectedRenderedTexts: [
          "Hello! We're Sunflower – a fresh approach to education",
        ],
      },
      verificationRequirements: vreqs,
    });
    const mode = result.criteria.find(
      (c) => c.criterion === "communication_mode_present",
    )!;
    expect(mode.proofLevel).toBe("contract_declared");
    expect(mode.verificationClass).toBe("contract_shape");
    expect(mode.proofLevel).not.toBe("verified");
  });

  it("J — criterion result → structured acceptance → block flag", () => {
    const blocked = evaluateStructuralCompositionCompliance({
      contract,
      evidence: { onImageCopy: { headline: "meta only" } },
      verificationRequirements: vreqs,
    });
    expect(blocked.blocksCanonicalCompletion).toBe(
      deriveBlocksCanonicalCompletion(blocked.criteria),
    );
    expect(
      blocked.criteria.some(
        (c) =>
          c.status === "UNVERIFIABLE" &&
          c.acceptanceOnUnmet === "block" &&
          c.verificationClass === "rendered_text",
      ),
    ).toBe(true);
  });
});

describe("Phase 13 — declarative text match policy", () => {
  it("presence_only does not require expected texts", () => {
    expect(
      applyRenderedTextMatchPolicy({
        policy: "presence_only",
        extractedText: "anything",
        expectedTexts: [],
      }),
    ).toBe("presence_ok");
  });

  it("normalized_containment without expected is unverifiable (not matched)", () => {
    expect(
      applyRenderedTextMatchPolicy({
        policy: "normalized_containment",
        extractedText: "Sunflower",
        expectedTexts: [],
      }),
    ).toBe("unverifiable");
  });

  it("unavailable policy never invents semantic equivalence", () => {
    expect(
      applyRenderedTextMatchPolicy({
        policy: "unavailable",
        extractedText: "a",
        expectedTexts: ["a"],
      }),
    ).toBe("unverifiable");
  });
});

describe("Phase 13 — capability separation + Sunflower fixture", () => {
  it("verification capabilities remain distinct and undeclared", () => {
    const {
      getPlatformVisualVerificationCapabilities,
    } = require("../../../src/platform/cdf/generation-validation/visual-verification-capabilities") as typeof import("../../../src/platform/cdf/generation-validation/visual-verification-capabilities");
    const rows = getPlatformVisualVerificationCapabilities();
    const ids = rows.map((r) => r.capabilityId);
    expect(ids).toEqual(
      expect.arrayContaining([
        "OCR_TEXT_RECOGNITION",
        "VISION_IMAGE_ANALYSIS",
        "VISION_LAYOUT_ANALYSIS",
        "VISION_BRAND_MARK_DETECTION",
      ]),
    );
    for (const row of rows) {
      if (row.capabilityId === "COMPOSITION_LAYER_EVIDENCE") {
        expect(row.claim).toBe("declared");
        continue;
      }
      expect(row.claim).toBe("undeclared");
    }
  });

  it("Sunflower-class remains a test fixture only (wrong message → not COMPLIANT)", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        renderedTextProof: { extractedText: "Sunflower", source: "ocr" },
        expectedRenderedTexts: [
          "Hello! We're Sunflower – a fresh approach to education for students in Classes 1-12",
        ],
      },
      verificationRequirements: vreqs,
    });
    expect(result.status).toBe("NON_COMPLIANT");
    expect(result.blocksCanonicalCompletion).toBe(true);
  });
});

describe("Phase 13 — static architecture audit", () => {
  it("no criterion-name substring acceptance coupling in production validation", () => {
    const root = path.resolve(
      __dirname,
      "../../../src/platform/cdf/generation-validation",
    );
    const files = [
      "structural-composition-validation.ts",
      "visual-verification-requirements.ts",
      "visual-verification-capabilities.ts",
      "rendered-text-proof.ts",
    ];
    const hits: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), "utf8");
      for (const pat of [
        /criterion\.includes\s*\(/g,
        /criterion\.startsWith\s*\(/g,
        /criterion\.endsWith\s*\(/g,
        /\.criterion\.includes\s*\(/g,
      ]) {
        const m = src.match(pat);
        if (m) hits.push(`${f}: ${m.join(", ")}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("no service/phase/provider semantic branches in verification modules", () => {
    const root = path.resolve(
      __dirname,
      "../../../src/platform/cdf/generation-validation",
    );
    const files = fs
      .readdirSync(root)
      .filter((f) => f.startsWith("visual-") || f.startsWith("structural-") || f.startsWith("rendered-"));
    const hits: { file: string; line: string; classification: string }[] = [];
    for (const f of files) {
      const lines = fs.readFileSync(path.join(root, f), "utf8").split("\n");
      lines.forEach((line, i) => {
        const l = line.toLowerCase();
        if (
          /serviceid\s*===/.test(l) ||
          /phaseid\s*===/.test(l) ||
          /provider\s*===/.test(l) ||
          /platform\s*===/.test(l)
        ) {
          hits.push({
            file: f,
            line: `${i + 1}:${line.trim()}`,
            classification: "authoritative-forbidden",
          });
        }
        if (
          /\binstagram\b/.test(l) ||
          /\bideogram\b/.test(l) ||
          (/\bsocial\b/.test(l) && !/social_creative/.test(l) && !/\/\/ /.test(line))
        ) {
          // Allow comments documenting exclusions; flag code identifiers.
          if (!line.trim().startsWith("//") && !line.includes("*")) {
            hits.push({
              file: f,
              line: `${i + 1}:${line.trim()}`,
              classification: "authoritative-forbidden",
            });
          }
        }
      });
    }
    expect(hits).toEqual([]);
  });
});

function resultCriterion(
  result: ReturnType<typeof evaluateStructuralCompositionCompliance>,
  id: string,
) {
  return result.criteria.find((c) => c.criterionId === id);
}
