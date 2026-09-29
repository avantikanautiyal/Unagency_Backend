/**
 * Diagnostic consistency: constraint planes, selected image operation capability,
 * and CDF context diagnostic plane contract.
 */

import assert from "node:assert/strict";
import {
  detectLabeledConstraintSectionsInPrompt,
  observeImageConstraintPlanes,
} from "../../../src/platform/collaboration/conversational-task-intelligence/forensic-image-constraint-audit";
import { resolveSelectedImageOperationCapability } from "../../../src/platform/providers/image/configs/image-provider-capabilities";
import {
  buildCdfContextDiagnosticPlanes,
  CDF_CONTEXT_DIAGNOSTIC_PLANE_CONTRACT,
} from "../../../src/platform/cdf/generation-context/trace";

describe("Image constraint observation planes (generic)", () => {
  it("ExecutionSpec-empty + CMR sections present → not interpreted as projection loss", () => {
    const planes = observeImageConstraintPlanes({
      metadata: {
        cdfCanonicalSectionsPresent: {
          requirements: true,
          constraints: false,
          outputRequirements: true,
          productionSpec: true,
          outputContract: true,
        },
        cdfCanonicalOutputRequirementsPresent: true,
        cdfCanonicalProductionSpecPresent: true,
      },
      prompt: [
        "CURRENT TASK",
        "Generate final creative",
        "REQUIREMENTS",
        "- platform: Instagram",
        "OUTPUT REQUIREMENTS",
        "[Output requirements]",
        "- aspect: 1:1",
        "botanical mango energy",
      ].join("\n"),
    });

    assert.equal(planes.executionSpec.negativeConstraintCount, 0);
    assert.equal(planes.executionSpec.hardConstraintCount, 0);
    assert.equal(planes.canonicalModelRequest.requirementsPresent, true);
    assert.equal(planes.canonicalModelRequest.outputRequirementsPresent, true);
    assert.equal(planes.canonicalModelRequest.constraintsPresent, false);
    assert.ok(
      planes.promptProjection.labeledSectionsPresent.includes(
        "OUTPUT_REQUIREMENTS",
      ),
    );
    assert.ok(
      planes.promptProjection.labeledSectionsPresent.includes("REQUIREMENTS"),
    );
    // Lexical botanical token ≠ ExecutionSpec hard constraint
    assert.equal(planes.promptProjection.leafTokenPresent, true);
    assert.equal(
      planes.emptyExecutionSpecInterpretation.code,
      "prompt_has_labeled_requirements_without_execution_spec",
    );
  });

  it("detects labeled sections across modalities without serviceId branches", () => {
    const sections = detectLabeledConstraintSectionsInPrompt(
      "OUTPUT CONTRACT\nvideo 16:9\nCONSTRAINTS\n- no logos\nPRODUCTION SPEC\nhouse",
    );
    assert.ok(sections.includes("OUTPUT_CONTRACT"));
    assert.ok(sections.includes("CONSTRAINTS"));
    assert.ok(sections.includes("PRODUCTION_SPEC"));
  });
});

describe("Selected image operation capability (generic)", () => {
  it("no reference attached → TEXT_TO_IMAGE even when provider supports edit", () => {
    const op = resolveSelectedImageOperationCapability({
      providerId: "provider.google",
      referenceImageAttached: false,
      referenceInputPresent: false,
      capabilityId: "image.generate",
    });
    assert.equal(op, "TEXT_TO_IMAGE");
  });

  it("reference attached + generate → REFERENCE_IMAGE (not mislabeled EDIT)", () => {
    const op = resolveSelectedImageOperationCapability({
      providerId: "provider.google",
      referenceImageAttached: true,
      referenceInputPresent: true,
      capabilityId: "image.generate",
    });
    assert.equal(op, "REFERENCE_IMAGE");
  });

  it("reference attached + edit intent → REFERENCE_IMAGE_EDIT when supported", () => {
    const op = resolveSelectedImageOperationCapability({
      providerId: "provider.google",
      referenceImageAttached: true,
      capabilityId: "image.edit",
      visualOperationKind: "MODIFY",
    });
    assert.equal(op, "REFERENCE_IMAGE_EDIT");
  });
});

describe("CDF context diagnostic planes (generic)", () => {
  it("artifact context loaded ≠ reference resolution applied", () => {
    const planes = buildCdfContextDiagnosticPlanes({
      referenceResolutionApplied: false,
      resolvedReferenceCount: 0,
      unresolvedReferenceCount: 0,
      artifactContextApplied: true,
      requiredArtifactCount: 1,
      loadedArtifactCount: 1,
      artifactVersions: ["cdfart_x_routes@1"],
      selectedDirectionPresent: true,
      selectedDirectionIdentity: "cdfart_x_routes@1#routes[0]",
    });

    assert.equal(
      (planes.referenceResolution as { applied: boolean }).applied,
      false,
    );
    assert.equal(
      (planes.artifactContext as { applied: boolean }).applied,
      true,
    );
    assert.equal(
      (planes.artifactContext as { loadedCount: number }).loadedCount,
      1,
    );
    assert.equal(
      (planes.referenceResolution as { meaning: string }).meaning,
      CDF_CONTEXT_DIAGNOSTIC_PLANE_CONTRACT.referenceResolution.meaning,
    );
    assert.equal(
      (planes.artifactContext as { meaning: string }).meaning,
      CDF_CONTEXT_DIAGNOSTIC_PLANE_CONTRACT.artifactContext.meaning,
    );
    assert.notEqual(
      (planes.referenceResolution as { meaning: string }).meaning,
      (planes.artifactContext as { meaning: string }).meaning,
    );
  });

  it("no serviceId/phaseId branching in plane contract module surface", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/cdf/generation-context/trace.ts",
      ),
      "utf8",
    );
    const fn = src.slice(
      src.indexOf("export function buildCdfContextDiagnosticPlanes"),
      src.indexOf("export const CANONICAL_SECTION_MARKERS"),
    );
    assert.equal(/serviceId\s*===/.test(fn), false);
    assert.equal(/phaseId\s*===/.test(fn), false);
  });
});
