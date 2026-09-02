/**
 * Priority 4.8.1 — Real provider constraint trace & visual requirement compliance audit.
 */

import { appendOutputRequirementsToPrompt } from "../../../src/platform/direct/append-output-requirements";
import { buildDirectProviderBag } from "../../../src/platform/direct/build-direct-provider-bag";
import { buildExecutionContextFromConversation } from "../../../src/platform/collaboration/service-conversation-context";
import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
} from "../../../src/platform/collaboration/service-conversation-types";
import {
  applyExecutionSpecHandoff,
  classifyRequirementFailureBoundary,
  evaluateDeliverableCompliance,
  freezeExecutionSpecSnapshot,
  hardConstraintConceptsFromSpec,
  requirementConstraintFingerprint,
  resetRequirementCounterForTests,
  resetThreadCounterForTests,
  resolveConversationalTurn,
  resolveFinalProviderFacingPrompt,
  resolveProviderPromptConstraintStatus,
  userTaskRequirementsFromExecutionSpec,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";

function sampleVisualRoutePrompt(routeDescription: string): string {
  return `[User brief]\nTerraLoop logo\n\n[Visual direction]\n${routeDescription}\n\n[Service deliverable requirements]\nDeliverable: Logo (PNG)`;
}

function userMsg(text: string): ServiceAiMessageRecord {
  return {
    id: `u-${text.slice(0, 12)}`,
    conversationId: "conv1",
    channelId: "service_abc",
    role: "user",
    text,
    createdAt: "2026-06-01T10:00:00.000Z",
    clientMessageId: `user-${text.slice(0, 12)}`,
    dedupeKey: `user-${text.slice(0, 12)}`,
  };
}

function logoState(): ServiceAiConversationState {
  return {
    service: "branding",
    subtype: "logos",
    brandId: "brand1",
    productPath: "branding/logos",
    activeExecutionId: "exec_logo_v1",
    activeArtifactId: "art_logo_v1",
  };
}

function resolveTurnPair(turn1: string, turn2: string) {
  const state0: ServiceAiConversationState = {
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
  const messages = [userMsg(turn1)];
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
    messages,
    state: state1,
    nowIso: () => "2026-06-15T00:00:01.000Z",
  });
  return { t1, t2, state1 };
}

function simulateRouteVisualProviderPrompt(input: {
  readonly visualPrompt: string;
  readonly executionSpec: NonNullable<
    ReturnType<typeof resolveConversationalTurn>["executionSpec"]
  >;
  readonly executionId: string;
}): string {
  const snapshot = freezeExecutionSpecSnapshot({
    executionId: input.executionId,
    spec: input.executionSpec,
  });
  const metadata = {
    executionSpecSnapshot: snapshot,
    productAction: "route_visual",
    routeVisualSlot: 0,
    skipOutputRequirements: true,
    service: "branding",
    subtype: "logos",
    capabilityId: "image.generate",
  };
  const finalPrompt = resolveFinalProviderFacingPrompt({
    prompt: input.visualPrompt,
    metadata,
  });
  const bag = buildDirectProviderBag({
    requestId: "req_test",
    rawPrompt: finalPrompt,
    metadata,
  });
  return bag.task!.request.rawPrompt;
}

describe("Priority 4.8.1 — Provider constraint trace & compliance audit", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
  });

  it("adaptive routing remains OFF", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });

  it("A — executionSpec contains NO_LEAF from explicit user message", () => {
    const { t1 } = resolveTurnPair(
      "Create a TerraLoop logo. Do not use leaf icons or leaf-like symbols.",
      "unused",
    );
    expect(t1.executionSpec?.creative.negativeConstraints?.length).toBeGreaterThan(0);
    const leaf = t1.executionSpec?.creative.negativeConstraints?.find((c) =>
      c.value.normalizedConcept.includes("leaf"),
    );
    expect(leaf?.value.enforcement).toBe("HARD_CONSTRAINT");
    expect(leaf?.provenance?.source).toBe("EXPLICIT_USER");
    expect(
      hardConstraintConceptsFromSpec(t1.executionSpec).some((c) => c.includes("leaf")),
    ).toBe(true);
  });

  it("B — executionSpecSnapshot preserves NO_LEAF", () => {
    const { t1 } = resolveTurnPair(
      "Create a logo. Do not use leaf icons.",
      "unused",
    );
    const snapshot = freezeExecutionSpecSnapshot({
      executionId: "exec_snap_1",
      spec: t1.executionSpec!,
    });
    expect(snapshot.spec.creative.negativeConstraints?.some((c) =>
      c.value.normalizedConcept.includes("leaf"),
    )).toBe(true);
    expect(requirementConstraintFingerprint(
      (snapshot.spec.creative.negativeConstraints ?? []).map((c) => c.value),
    )).toMatch(/leaf/);
  });

  it("C — route_visual generation instruction contains NO_LEAF", () => {
    const { t2 } = resolveTurnPair(
      "Create a TerraLoop logo. Do not use leaf icons.",
      "I asked you to not use leaf anywhere in the logo.",
    );
    const visualPrompt = sampleVisualRoutePrompt(
      "Minimal wordmark for TerraLoop eco brand",
    );
    const providerPrompt = simulateRouteVisualProviderPrompt({
      visualPrompt,
      executionSpec: t2.executionSpec!,
      executionId: "exec_route_visual_1",
    });
    expect(providerPrompt).toMatch(/HARD CONSTRAINT.*leaf/i);
    expect(providerPrompt).toMatch(/\[User requirements — negative constraints\]/);
    expect(
      resolveProviderPromptConstraintStatus({
        prompt: providerPrompt,
        spec: t2.executionSpec,
      }),
    ).toBe("PRESENT");
  });

  it("D — final provider-facing image request contains NO_LEAF", () => {
    const { t2 } = resolveTurnPair(
      "Create a logo. Do not use leaf icons.",
      "Regenerate; I specifically said no leaf.",
    );
    const visualPrompt = "Logo wordmark, clean typography, TerraLoop";
    const providerFacing = simulateRouteVisualProviderPrompt({
      visualPrompt,
      executionSpec: t2.executionSpec!,
      executionId: "exec_provider_1",
    });
    expect(providerFacing).toMatch(/HARD CONSTRAINT/i);
    expect(providerFacing.toLowerCase()).toMatch(/leaf/);
    expect(providerFacing).not.toBe(visualPrompt);
  });

  it("E — model violation: execution succeeded, compliance FAILED when evaluable", () => {
    const { t2 } = resolveTurnPair(
      "Create a logo for TerraLoop. Do not use leaf icons.",
      "Generate again properly. I specifically said no leaf icons.",
    );
    const report = evaluateDeliverableCompliance({
      spec: t2.executionSpec,
      previewText: "Logo featuring leaf motif and botanical elements",
    });
    expect(report.requirementComplianceStatus).toBe("REQUIREMENT_COMPLIANCE_FAILURE");
    const boundary = classifyRequirementFailureBoundary({
      spec: t2.executionSpec,
      finalProviderPrompt: simulateRouteVisualProviderPrompt({
        visualPrompt: "TerraLoop logo",
        executionSpec: t2.executionSpec!,
        executionId: "exec_violation",
      }),
      providerSucceeded: true,
      complianceStatus: report.requirementComplianceStatus,
      complianceMethod: report.results.find((r) => r.checkId.includes("leaf"))?.method,
    });
    expect(boundary).toBe("REQUIREMENT_PASSED_TO_MODEL_BUT_MODEL_VIOLATED");
  });

  it("F — compliant metadata passes requirement compliance when supported", () => {
    const { t1 } = resolveTurnPair(
      "Create a logo for TerraLoop. Do not use leaf icons.",
      "unused",
    );
    const report = evaluateDeliverableCompliance({
      spec: t1.executionSpec,
      previewText: "Minimal geometric TerraLoop wordmark, no botanical elements",
    });
    const leafResult = report.results.find((r) => r.checkId.includes("leaf"));
    expect(leafResult?.status).toBe("PASS");
  });

  it("G — regeneration preserves NO_LEAF through second provider request", () => {
    const { t2 } = resolveTurnPair(
      "Create a TerraLoop logo. Do not use leaf icons or leaf-like symbols.",
      "I asked you to not use leaf anywhere in the logo.",
    );
    expect(["REGENERATE", "MODIFY"]).toContain(t2.action);
    const leafActive = t2.executionSpec?.creative.negativeConstraints?.find((c) =>
      c.value.normalizedConcept.includes("leaf"),
    );
    expect(leafActive).toBeDefined();

    const turn2ProviderPrompt = simulateRouteVisualProviderPrompt({
      visualPrompt: sampleVisualRoutePrompt("Refined TerraLoop wordmark"),
      executionSpec: t2.executionSpec!,
      executionId: "exec_regen_provider",
    });
    expect(turn2ProviderPrompt).toMatch(/HARD CONSTRAINT.*leaf/i);
    const reqs = userTaskRequirementsFromExecutionSpec(t2.executionSpec!);
    expect(reqs.some((r) => r.id.includes("leaf"))).toBe(true);
  });

  it("handoff without snapshot loses constraint — documents REQUIREMENT_LOST boundary", () => {
    const { t1 } = resolveTurnPair(
      "Create a logo. Do not use leaf icons.",
      "unused",
    );
    const visualPrompt = sampleVisualRoutePrompt("Eco brand logo");
    const bare = appendOutputRequirementsToPrompt({
      prompt: visualPrompt,
      metadata: {
        productAction: "route_visual",
        routeVisualSlot: 0,
        skipOutputRequirements: true,
        capabilityId: "image.generate",
      },
    });
    expect(bare).not.toMatch(/HARD CONSTRAINT/i);
    expect(
      classifyRequirementFailureBoundary({
        spec: t1.executionSpec,
        finalProviderPrompt: bare,
        providerSucceeded: true,
      }),
    ).toBe("REQUIREMENT_LOST_IN_PROVIDER_HANDOFF");
  });

  it("applyExecutionSpecHandoff stamps client executionSpecHandoff for route_visual", async () => {
    const { t1 } = resolveTurnPair(
      "Create a logo. Do not use leaf icons.",
      "unused",
    );
    const stamped = await applyExecutionSpecHandoff({
      host: {
        loadExecution: async () => undefined,
        deps: {
          nowIso: () => "2026-06-15T00:00:00.000Z",
          createId: (p: string) => `${p}_test`,
        },
      },
      executionId: "exec_handoff_1",
      metadata: {
        productAction: "route_visual",
        executionSpecHandoff: t1.executionSpec,
        channelId: "service_abc",
      },
    });
    expect(stamped.executionSpecSnapshot).toBeDefined();
    expect(stamped.executionSpecNegativeConstraintCount).toBeGreaterThan(0);
    const prompt = appendOutputRequirementsToPrompt({
      prompt: "Visual route prompt",
      metadata: stamped,
    });
    expect(prompt).toMatch(/HARD CONSTRAINT.*leaf/i);
  });

  it("production path — buildExecutionContext effectiveInstruction used for regenerate", () => {
    const { t1, t2, state1 } = resolveTurnPair(
      "Create a TerraLoop logo. Do not use leaf icons.",
      "I asked you to not use leaf anywhere in the logo.",
    );
    const ctx = buildExecutionContextFromConversation({
      conversationId: "conv1",
      channelId: "service_abc",
      messages: [
        userMsg("Create a TerraLoop logo. Do not use leaf icons."),
        userMsg("I asked you to not use leaf anywhere in the logo."),
      ],
      state: {
        ...state1,
        taskIntelligence: Object.freeze({
          ...t2.updatedTaskState,
          threads: Object.freeze(
            t2.updatedTaskState.threads.map((thread) =>
              thread.threadId === t2.activeThreadId
                ? Object.freeze({ ...thread, lastExecutionSpec: t2.executionSpec })
                : thread,
            ),
          ),
        }),
      },
      latestUserMessage: "I asked you to not use leaf anywhere in the logo.",
    });
    expect(["REGENERATE", "MODIFY"]).toContain(ctx.conversationalAction);
    expect(ctx.effectiveInstruction).toMatch(/HARD CONSTRAINT/i);
    expect(t1.executionSpec?.creative.negativeConstraints?.length).toBeGreaterThan(0);
  });

  it("visual NO_LEAF compliance is NOT_AUTOMATED for image artifacts without text metadata", () => {
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
  });
});
