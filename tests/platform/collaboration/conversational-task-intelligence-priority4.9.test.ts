/**
 * Priority 4.9 — Artifact-grounded visual modification & visual requirement evaluation.
 */

import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";
import {
  applyVisualModificationPrepass,
  resolveReferenceCapableImageRouting,
} from "../../../src/platform/api/services/apply-visual-modification-prepass";
import {
  attachReferenceToExecutionMetadata,
  resolveArtifactReferenceFromInlineRef,
} from "../../../src/platform/collaboration/conversational-task-intelligence/artifact-reference-bridge";
import {
  capabilityProfileForProvider,
  listReferenceCapableImageProviderIds,
  providerSupportsReferenceImageEdit,
} from "../../../src/platform/providers/image/configs/image-provider-capabilities";
import {
  evaluateDeliverableCompliance,
  evaluateDeliverableComplianceAsync,
  resetRequirementCounterForTests,
  resetThreadCounterForTests,
  resetVisualRequirementJudgeForTests,
  registerVisualRequirementJudge,
  resolveConversationalTurn,
  resolveReferences,
  extractSemanticSignals,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import { GoogleImagenProtocol } from "../../../src/platform/providers/image/google/google-imagen-protocol";
import { GOOGLE_IMAGEN_SPEC, IDEOGRAM_IMAGE_SPEC } from "../../../src/platform/providers/image/configs/verified-image-provider-specs";
import { extractReferenceImage } from "../../../src/platform/providers/image/common/vendor-image-protocol";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
} from "../../../src/platform/collaboration/service-conversation-types";

const FIXTURE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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

function routeMsg(
  executionId: string,
  routes: ServiceAiMessageRecord["routes"],
): ServiceAiMessageRecord {
  return {
    id: `ai-${executionId}`,
    conversationId: "conv1",
    channelId: "service_abc",
    role: "ai",
    text: "Here are your routes.",
    executionId,
    routes,
    createdAt: "2026-06-01T10:05:00.000Z",
    dedupeKey: `ai-${executionId}`,
  };
}

function resolveTurnPair(turn1: string, turn2: string, extraMessages: ServiceAiMessageRecord[] = []) {
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
    messages: extraMessages,
    state: state0,
    nowIso: () => "2026-06-15T00:00:00.000Z",
  });
  const messages = [...extraMessages, userMsg(turn1)];
  const state1 = {
    ...state0,
    activeExecutionId: "exec_logo_v1",
    activeArtifactId: "art_logo_v1",
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

describe("Priority 4.9 — Artifact-grounded modification & visual evaluation", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
    resetVisualRequirementJudgeForTests();
  });

  it("adaptive routing remains OFF", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });

  it("1 — provider capability registry: only Google supports reference-image edit", () => {
    expect(providerSupportsReferenceImageEdit(GOOGLE_IMAGEN_SPEC.canonicalProviderId)).toBe(true);
    expect(providerSupportsReferenceImageEdit(IDEOGRAM_IMAGE_SPEC.canonicalProviderId)).toBe(false);
    expect(listReferenceCapableImageProviderIds()).toContain("provider.google");
    const googleProfile = capabilityProfileForProvider("provider.google");
    expect(googleProfile?.capabilities).toEqual(
      expect.arrayContaining(["REFERENCE_IMAGE", "IMAGE_EDIT", "TEXT_TO_IMAGE"]),
    );
  });

  it("2 — reference artifact resolves from inline fixture", () => {
    const resolved = resolveArtifactReferenceFromInlineRef({
      organizationId: "org1",
      executionId: "exec1",
      artifact: {
        artifactId: "art_logo_v1",
        kind: "image",
        label: FIXTURE_PNG,
        mimeType: "image/png",
      },
    });
    expect(resolved?.artifactId).toBe("art_logo_v1");
    expect(resolved?.providerInput.url).toBe(FIXTURE_PNG);
  });

  it("3 — TerraLoop turn 2 resolves MODIFY/REGENERATE with preserved constraints and operation spec", () => {
    const { t1, t2 } = resolveTurnPair(
      "Create a TerraLoop logo. Do not use leaf icons, leaf symbols, plants, trees, or recycling arrows. Do not use green.",
      "I asked you to not use leaf anywhere in the logo. Regenerate it properly, but keep the existing logo as the basis.",
    );
    expect(t1.executionSpec?.creative.negativeConstraints?.some((c) =>
      c.value.normalizedConcept.includes("leaf"),
    )).toBe(true);
    expect(["MODIFY", "REGENERATE"]).toContain(t2.action);
    expect(t2.executionSpec?.operation?.operationKind).toMatch(/MODIFY|REGENERATE/);
    expect(t2.executionSpec?.operation?.preserveExisting).toBe(true);
    expect(t2.executionSpec?.operation?.targetArtifactId ?? t2.reference?.artifactId).toBeTruthy();
    const t2Concepts = (t2.executionSpec?.creative.negativeConstraints ?? []).map(
      (c) => c.value.normalizedConcept,
    );
    expect(t2Concepts.some((c) => c.includes("leaf"))).toBe(true);
    const t1Concepts = (t1.executionSpec?.creative.negativeConstraints ?? []).map(
      (c) => c.value.normalizedConcept,
    );
    for (const concept of t1Concepts) {
      expect(t2Concepts).toContain(concept);
    }
  });

  it("4 — monochrome MODIFY targets existing artifact", () => {
    const { t2 } = resolveTurnPair("Create a logo.", "Make the selected logo monochrome.");
    expect(t2.action).toBe("MODIFY");
    expect(t2.executionSpec?.operation?.operationKind).toBe("MODIFY");
    expect(t2.executionSpec?.operation?.targetArtifactId).toBe("art_logo_v1");
  });

  it("5 — Route 2 leaf removal targets Route 2 artifact", () => {
    const routes = routeMsg("exec_routes", [
      {
        id: "route_1",
        title: "Route 1",
        assets: [{ id: "a1", artifactId: "art_r1" }],
      },
      {
        id: "route_2",
        title: "Route 2",
        assets: [{ id: "a2", artifactId: "art_r2" }],
      },
      {
        id: "route_3",
        title: "Route 3",
        assets: [{ id: "a3", artifactId: "art_r3" }],
      },
    ]);
    const signals = extractSemanticSignals(
      "Take route 2 and remove the leaf symbol.",
    );
    const ref = resolveReferences({
      message: "Take route 2 and remove the leaf symbol.",
      signals,
      messages: [routes],
      thread: {
        threadId: "thread1",
        label: "logo",
        objective: "logo",
        requirements: [],
        alternatives: [],
        createdAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-01T10:00:00.000Z",
      },
      taskState: {
        version: "p4.5.0",
        service: "branding",
        subtype: "logos",
        threads: [],
      },
    });
    expect(ref?.routeIndex).toBe(2);
    expect(ref?.artifactId).toBe("art_r2");
    expect(ref?.artifactId).not.toBe("art_r1");
  });

  it("6 — visual modification prepass stamps reference image and image.edit", async () => {
    const inlineArtifact = {
      artifactId: "art_logo_v1",
      kind: "image",
      label: FIXTURE_PNG,
      mimeType: "image/png",
    };
    const mod = await applyVisualModificationPrepass({
      metadata: {
        conversationalAction: "MODIFY",
        conversationalReferencedArtifactId: "art_logo_v1",
        referenceArtifactId: "art_logo_v1",
      },
      organizationId: "org1",
      executionSpec: {
        planeVersion: "p4.6.0",
        task: { action: { value: "MODIFY", provenance: { source: "EXPLICIT_USER", explicit: true } } },
        content: {},
        creative: { negativeConstraints: [] },
        deliverables: [],
        outputIntent: {
          mode: { value: "FINAL", provenance: { source: "EXPLICIT_USER", explicit: true } },
        },
        resolutionState: "RESOLVED",
        executionInstruction: "Remove the leaf.",
        operation: {
          operationKind: "MODIFY",
          targetArtifactId: "art_logo_v1",
          referenceInput: { kind: "artifact", artifactId: "art_logo_v1" },
          preserveExisting: true,
        },
      } as never,
      artifactStore: new Map([["exec_logo_v1", [inlineArtifact]]]),
    });
    expect(mod.ok).toBe(true);
    if (!mod.ok) return;
    expect(mod.value.capabilityId).toBe("image.edit");
    expect(mod.value.metadata.referenceInputPresent).toBe(true);
    expect(mod.value.metadata.targetArtifactId).toBe("art_logo_v1");
    expect(mod.value.metadata.image).toBeTruthy();
  });

  it("7 — Google wire request includes reference image for image.edit", () => {
    const resolved = resolveArtifactReferenceFromInlineRef({
      organizationId: "org1",
      artifact: {
        artifactId: "art_logo_v1",
        kind: "image",
        label: FIXTURE_PNG,
        mimeType: "image/png",
      },
    })!;
    const metadata = attachReferenceToExecutionMetadata({
      metadata: { conversationalAction: "MODIFY", visualOperationKind: "MODIFY" },
      resolved,
    });
    const req: ProviderExecutionRequest = {
      requestId: "req1",
      providerId: GOOGLE_IMAGEN_SPEC.canonicalProviderId as never,
      modelId: GOOGLE_IMAGEN_SPEC.inventoryModelId,
      capabilityId: "image.edit" as never,
      payload: {
        prompt: "Remove the leaf. HARD CONSTRAINT — Do not include leaf symbols.",
        text: "Remove the leaf. HARD CONSTRAINT — Do not include leaf symbols.",
        image: resolved.providerInput,
        assets: [resolved.providerInput],
      },
      metadata,
      context: {} as never,
      timeoutPolicy: {} as never,
      retryPolicy: {} as never,
    };
    const ref = extractReferenceImage(req.payload ?? {});
    expect(ref?.base64).toBeTruthy();
    const plan = new GoogleImagenProtocol().buildGenerateRequest({
      spec: GOOGLE_IMAGEN_SPEC,
      request: { ...req, capabilityId: "image.edit" as never, metadata },
      wireModelId: GOOGLE_IMAGEN_SPEC.wireModelId,
    });
    const parts = (
      (plan.request.body as { contents?: Array<{ parts?: unknown[] }> }).contents?.[0]
        ?.parts ?? []
    ) as Array<Record<string, unknown>>;
    expect(parts.some((p) => p.inlineData)).toBe(true);
    expect(String(parts.find((p) => p.text)?.text)).toContain("existing result to modify");
  });

  it("8 — incapable provider returns UNSUPPORTED_OPERATION when no fallback", () => {
    const unsupported = resolveReferenceCapableImageRouting({
      metadata: {
        referenceInputPresent: true,
        targetArtifactId: "art_logo_v1",
        visualOperationKind: "MODIFY",
      },
      routedProviderId: IDEOGRAM_IMAGE_SPEC.canonicalProviderId,
      routedModelId: IDEOGRAM_IMAGE_SPEC.inventoryModelId,
      failoverChain: [],
    });
    expect(unsupported.ok).toBe(false);
    if (unsupported.ok) return;
    expect(String(unsupported.error.message)).toContain("does not support reference-image");
  });

  it("9 — incapable provider falls back to reference-capable provider", () => {
    const routed = resolveReferenceCapableImageRouting({
      metadata: {
        referenceInputPresent: true,
        targetArtifactId: "art_logo_v1",
        visualOperationKind: "MODIFY",
      },
      routedProviderId: IDEOGRAM_IMAGE_SPEC.canonicalProviderId,
      routedModelId: IDEOGRAM_IMAGE_SPEC.inventoryModelId,
      failoverChain: [
        {
          providerId: GOOGLE_IMAGEN_SPEC.canonicalProviderId,
          modelId: GOOGLE_IMAGEN_SPEC.inventoryModelId,
        },
      ],
    });
    expect(routed.ok).toBe(true);
    if (!routed.ok) return;
    expect(routed.value.providerId).toBe("provider.google");
    expect(routed.value.fallbackUsed).toBe(true);
  });

  it("10 — provider execution success is separable from requirement compliance failure", async () => {
    registerVisualRequirementJudge(async (input) =>
      Object.freeze({
        requirementId: `negative.${input.normalizedConcept}`,
        requirement: input.subject,
        normalizedConcept: input.normalizedConcept,
        status: "VIOLATED",
        evaluationMode: "MODEL_JUDGED",
        evaluatorProvenance: Object.freeze({
          evaluatorId: "mock-visual-judge",
          evaluatorVersion: "mock.judge.v1",
          evaluationPlaneVersion: "p4.6.0",
          modelId: "eval-model",
          providerId: "provider.mock",
        }),
        evidence: Object.freeze(["mock judge detected leaf symbol"]),
      }),
    );
    const { t1 } = resolveTurnPair(
      "Create a TerraLoop logo. Do not use leaf icons or leaf symbols. Do not use green.",
      "unused",
    );
    const report = await evaluateDeliverableComplianceAsync({
      spec: t1.executionSpec,
      imageArtifactBytes: Buffer.from("fake-png"),
      imageArtifactMimeType: "image/png",
    });
    expect(report.requirementComplianceStatus).toBe("REQUIREMENT_COMPLIANCE_FAILURE");
    const leaf = report.results.find((r) => r.checkId.includes("leaf"));
    expect(leaf?.method).toBe("MODEL_JUDGED");
    expect(leaf?.evaluatorProvenance?.evaluatorId).toBe("mock-visual-judge");
  });

  it("11 — image artifact leaf constraint is NOT_AUTOMATED without judge", () => {
    const { t1 } = resolveTurnPair(
      "Create a TerraLoop logo. Do not use leaf icons or leaf symbols.",
      "unused",
    );
    const report = evaluateDeliverableCompliance({
      spec: t1.executionSpec,
      imageArtifactBytes: Buffer.from("fake-png"),
      imageArtifactMimeType: "image/png",
    });
    const leaf = report.results.find((r) => r.checkId.includes("leaf"));
    expect(leaf?.status).toBe("NOT_AUTOMATED");
    expect(leaf?.evaluationMode).toBe("NOT_AUTOMATED");
  });
});
