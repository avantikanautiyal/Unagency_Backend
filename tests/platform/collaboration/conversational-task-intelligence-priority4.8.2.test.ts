/**
 * Priority 4.8.2 — Forensic image generation constraint audit.
 */

import { appendOutputRequirementsToPrompt } from "../../../src/platform/direct/append-output-requirements";
import { buildDirectProviderBag } from "../../../src/platform/direct/build-direct-provider-bag";
import { IdeogramImageProtocol } from "../../../src/platform/providers/image/ideogram/ideogram-image-protocol";
import { IDEOGRAM_IMAGE_SPEC } from "../../../src/platform/providers/image/configs/verified-image-provider-specs";
import {
  auditPromptTransformation,
  buildForensicRequirementRecords,
  classifyForensicDiagnosis,
  detectConflictingVisualLanguage,
  extractHardConstraintBlockFromInstruction,
  hardConstraintBlockPresent,
  promptFingerprint,
  sanitizeProviderWireBody,
} from "../../../src/platform/collaboration/conversational-task-intelligence/forensic-image-constraint-audit";
import {
  evaluateDeliverableCompliance,
  freezeExecutionSpecSnapshot,
  resetRequirementCounterForTests,
  resetThreadCounterForTests,
  resolveConversationalTurn,
  resolveFinalProviderFacingPrompt,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import {
  negativeConstraintSpec,
  resolvedNegativeConstraint,
} from "../../../src/platform/collaboration/conversational-task-intelligence/requirement-enforcement";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { buildVisualDirectorPrompt } from "../../../../Unagency-frontend/packages/api/src/domain/visual-route-directions";
import { buildServiceDeliverableConstraints } from "../../../../Unagency-frontend/packages/api/src/domain/visual-service-prompt";

function resolveTurnPair(turn1: string, turn2: string) {
  const state0 = {
    service: "branding",
    subtype: "logos",
    brandId: "brand1",
    productPath: "branding/logos",
  };
  const t1 = resolveConversationalTurn({
    conversationId: "conv1",
    channelId: "service_abc",
    latestUserMessage: turn1,
    messages: [],
    state: state0,
    nowIso: () => "2026-06-15T00:00:00.000Z",
  });
  const state1 = {
    ...state0,
    activeExecutionId: "exec_logo_v1",
    taskIntelligence: Object.freeze({
      ...t1.updatedTaskState,
      threads: Object.freeze(
        t1.updatedTaskState.threads.map((thread) =>
          thread.threadId === t1.activeThreadId
            ? Object.freeze({ ...thread, lastExecutionSpec: t1.executionSpec })
            : thread,
        ),
      ),
    }),
  };
  const t2 = resolveConversationalTurn({
    conversationId: "conv1",
    channelId: "service_abc",
    latestUserMessage: turn2,
    messages: [
      {
        id: "u1",
        conversationId: "conv1",
        channelId: "service_abc",
        role: "user" as const,
        text: turn1,
        createdAt: "2026-06-15T00:00:00.000Z",
        clientMessageId: "u1",
        dedupeKey: "u1",
      },
    ],
    state: state1,
    nowIso: () => "2026-06-15T00:00:01.000Z",
  });
  return { t1, t2 };
}

function simulateIdeogramWirePrompt(finalPrompt: string): Record<string, unknown> {
  const protocol = new IdeogramImageProtocol();
  const plan = protocol.buildGenerateRequest({
    spec: IDEOGRAM_IMAGE_SPEC,
    request: {
      requestId: "req_test",
      providerId: "provider.ideogram" as never,
      modelId: "ideogram-3",
      capabilityId: "image.generate" as never,
      payload: { prompt: finalPrompt },
    },
    wireModelId: IDEOGRAM_IMAGE_SPEC.wireModelId,
  });
  return plan.request.body as Record<string, unknown>;
}

describe("Priority 4.8.2 — Forensic image constraint audit", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
  });

  it("adaptive routing remains OFF", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });

  it("logs canonical leaf requirement with HARD_CONSTRAINT / EXPLICIT_USER / ACTIVE", () => {
    const { t2 } = resolveTurnPair(
      "Create a TerraLoop logo. Do not use leaf icons, leaf symbols, plants, trees, or recycling arrows.",
      "I asked you to not use leaf anywhere in the logo. Generate it again properly.",
    );
    const records = buildForensicRequirementRecords(t2.executionSpec);
    const leaf = records.find((r) => r.concept.includes("leaf"));
    expect(leaf?.enforcement).toBe("HARD_CONSTRAINT");
    expect(leaf?.provenance).toBe("EXPLICIT_USER");
    expect(leaf?.state).toBe("ACTIVE");
    expect(leaf?.requirementId).toMatch(/^negative\./);
  });

  it("regeneration preserves constraints and reaches provider wire request", () => {
    const { t2 } = resolveTurnPair(
      "Create a TerraLoop logo. Do not use leaf icons, leaf symbols, plants, trees, or recycling arrows.",
      "I asked you to not use leaf anywhere in the logo. Generate it again properly.",
    );
    expect(["REGENERATE", "MODIFY"]).toContain(t2.action);

    const snapshot = freezeExecutionSpecSnapshot({
      executionId: "exec_forensic_1",
      spec: t2.executionSpec!,
    });
    const visualPrompt = "Creative direction: minimal TerraLoop wordmark";
    const finalPrompt = resolveFinalProviderFacingPrompt({
      prompt: visualPrompt,
      metadata: {
        executionSpecSnapshot: snapshot,
        productAction: "route_visual",
        skipOutputRequirements: true,
      },
    });
    const wire = simulateIdeogramWirePrompt(finalPrompt);
    const sanitized = sanitizeProviderWireBody(wire);

    expect(sanitized.hardConstraintPresent).toBe(true);
    expect(sanitized.leafConstraintPresent).toBe(true);
    expect(typeof sanitized.promptFingerprint).toBe("string");

    const bag = buildDirectProviderBag({
      requestId: "req_test",
      rawPrompt: finalPrompt,
      metadata: { productAction: "route_visual" },
    });
    expect(bag.task!.request.rawPrompt).toMatch(/HARD CONSTRAINT/i);
  });

  it("append_output_requirements audit — constraints survive transformation", () => {
    const { t2 } = resolveTurnPair(
      "Create a logo. Do not use leaf icons.",
      "Regenerate with no leaf.",
    );
    const snapshot = freezeExecutionSpecSnapshot({
      executionId: "exec_audit",
      spec: t2.executionSpec!,
    });
    const input = "Route visual prompt without constraints";
    const output = appendOutputRequirementsToPrompt({
      prompt: input,
      metadata: { executionSpecSnapshot: snapshot, productAction: "route_visual" },
    });
    const audit = auditPromptTransformation({
      stage: "append_output_requirements",
      inputPrompt: input,
      outputPrompt: output,
      spec: t2.executionSpec,
    });
    expect(audit.inputHasHardConstraint).toBe(false);
    expect(audit.outputHasHardConstraint).toBe(true);
    expect(audit.constraintWeakened).toBe(false);
  });

  it("visual director receives hardConstraintBlock from effectiveInstruction", () => {
    const block =
      "[User requirements — negative constraints]\nHARD CONSTRAINT — Do NOT include leaf icons.";
    const director = buildVisualDirectorPrompt({
      brief: "TerraLoop logo",
      service: "branding",
      subtype: "logos",
      hardConstraintBlock: block,
    });
    expect(director).toContain("Non-negotiable client prohibitions");
    expect(director).toContain("HARD CONSTRAINT");
    expect(director).toContain("Do NOT use sustainability/nature/eco clichés");
  });

  it("detects weakening when creative section introduces leaf despite trailing constraint", () => {
    const creative =
      "Create a sustainable eco logo with natural leaf motifs and botanical elements.";
    const full = `${creative}\n\n[User requirements — negative constraints]\nHARD CONSTRAINT — Do NOT include leaf icons.`;
    const spec = {
      planeVersion: "p4.6.0" as const,
      resolutionState: "RESOLVED" as const,
      deliverables: [],
      outputIntent: {
        mode: {
          value: "ALTERNATIVES" as const,
          provenance: { source: "EXPLICIT_USER" as const, explicit: true },
        },
      },
      content: {},
      technical: {},
      creative: {
        negativeConstraints: [
          resolvedNegativeConstraint(negativeConstraintSpec("leaf icons")),
        ],
      },
      task: {},
      brandAssets: {},
      executionInstruction: full,
    };
    const conflicts = detectConflictingVisualLanguage(creative);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(
      classifyForensicDiagnosis({
        spec,
        finalProviderPrompt: full,
        creativeSectionPrompt: creative,
        providerSucceeded: true,
        complianceMethod: "NOT_AUTOMATED",
        complianceStatus: "NOT_EVALUATED",
        constraintWeakened: true,
      }),
    ).toBe("REQUIREMENT_WEAKENED_BEFORE_PROVIDER");
  });

  it("model non-compliance fixture — provider success ≠ compliant", () => {
    const { t2 } = resolveTurnPair(
      "Create a logo for TerraLoop. Do not use leaf icons.",
      "Generate again properly. I specifically said no leaf icons.",
    );
    const snapshot = freezeExecutionSpecSnapshot({
      executionId: "exec_model_violation",
      spec: t2.executionSpec!,
    });
    const finalPrompt = resolveFinalProviderFacingPrompt({
      prompt: "TerraLoop wordmark",
      metadata: { executionSpecSnapshot: snapshot, productAction: "route_visual" },
    });
    expect(hardConstraintBlockPresent(finalPrompt)).toBe(true);

    const compliance = evaluateDeliverableCompliance({
      spec: t2.executionSpec,
      previewText: "Logo with leaf motif and foliage elements",
    });
    expect(compliance.requirementComplianceStatus).toBe("REQUIREMENT_COMPLIANCE_FAILURE");

    expect(
      classifyForensicDiagnosis({
        spec: t2.executionSpec,
        finalProviderPrompt: finalPrompt,
        providerSucceeded: true,
        complianceStatus: compliance.requirementComplianceStatus,
        complianceMethod: compliance.results.find((r) => r.checkId.includes("leaf"))?.method,
      }),
    ).toBe("MODEL_OUTPUT_NON_COMPLIANT_AND_EVALUATION_FAILED");
  });

  it("image artifact without text metadata — evaluation NOT_AUTOMATED", () => {
    const { t1 } = resolveTurnPair(
      "Create a logo. Do not use leaf icons.",
      "unused",
    );
    const report = evaluateDeliverableCompliance({
      spec: t1.executionSpec,
      previewText: undefined,
    });
    const leafCheck = report.results.find((r) => r.checkId.includes("leaf"));
    expect(leafCheck?.status).toBe("NOT_AUTOMATED");
    expect(leafCheck?.method).toBe("NOT_AUTOMATED");

    const finalPrompt = "prompt with HARD CONSTRAINT — Do NOT include leaf.";
    expect(
      classifyForensicDiagnosis({
        spec: t1.executionSpec,
        finalProviderPrompt: finalPrompt,
        providerSucceeded: true,
        complianceStatus: report.requirementComplianceStatus,
        complianceMethod: "NOT_AUTOMATED",
      }),
    ).toBe("REQUIREMENT_REACHED_PROVIDER_BUT_MODEL_VIOLATED");
  });

  it("extractHardConstraintBlockFromInstruction finds constraint block", () => {
    const instruction =
      "Create logo.\n\n[User requirements — negative constraints]\nHARD CONSTRAINT — Do NOT include leaf.";
    expect(extractHardConstraintBlockFromInstruction(instruction)).toMatch(
      /negative constraints/i,
    );
  });

  it("service defaults for branding do not inject leaf/plant imagery", () => {
    const lines = buildServiceDeliverableConstraints({
      service: "branding",
      subtype: "logos",
      prompt: "TerraLoop logo",
    });
    const joined = lines.join(" ").toLowerCase();
    expect(joined).not.toMatch(/\bleaf\b|\bplant\b|\btree\b|\brecycl/);
  });

  it("prompt fingerprint is stable for identical prompts", () => {
    const a = promptFingerprint("HARD CONSTRAINT — no leaf");
    const b = promptFingerprint("HARD CONSTRAINT — no leaf");
    expect(a).toBe(b);
  });
});
