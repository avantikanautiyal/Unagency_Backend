/**
 * Phase 11 — Provider-neutral Model Runtime boundary.
 */

import * as artifactRepo from "../../../src/platform/cdf/artifacts/repository";
import { createVersion } from "../../../src/platform/cdf/artifacts/repository";
import {
  applyCdfTransition,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  createArtifact,
  fixturePresentationStoryline,
  getCdfSession,
  markApproved,
  orchestrateCanonicalGenerationContext,
  PRESENTATION_ARTIFACT_KEYS,
  resetCanonicalGenerationTracesForTests,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resetContextOrchestratorTracesForTests,
  runCanonicalGenerationRuntimeProof,
  saveCdfSession,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import {
  flattenCanonicalModelRequestToLabeledPrompt,
  extractCanonicalMultimodalProviderHandoff,
} from "../../../src/platform/ai/canonical-model-request";
import {
  assertModelRequestUnchanged,
  categorizeProviderRuntimeError,
  getModelRuntimeTraceEventsForTests,
  MODEL_RUNTIME_SOURCE,
  normalizeProviderExecutionResult,
  prepareCanonicalModelRuntime,
  resetModelRuntimeTracesForTests,
} from "../../../src/platform/ai/model-runtime";
import { shouldSkipLegacySemanticPromptMutation as skipLegacyFromOrchestrator } from "../../../src/platform/ai/context-orchestrator";
import { mapCanonicalToOpenAIRequest } from "../../../src/platform/providers/openai/requests/request-mapper";
import { mapCanonicalToAnthropicRequest } from "../../../src/platform/providers/anthropic/requests/request-mapper";
import { toAdapterRequestFromExecution } from "../../../src/platform/providers/common/to-adapter-request";
import { sampleRequest } from "../../../src/platform/providers/runtime/testing";
import type { WorkingMemorySourceMessage } from "../../../src/platform/ai/conversation-working-memory";
import type { ProviderExecutionResult } from "../../../src/platform/providers/runtime/contracts/provider-execution-response";
import { asProviderId } from "../../../src/platform/core/identifiers";
import type { ModelRuntimePrepareResult } from "../../../src/platform/ai/model-runtime";

function expectPreparedOk(
  prepared: ModelRuntimePrepareResult,
): Extract<ModelRuntimePrepareResult, { ok: true }> {
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) throw new Error(prepared.message);
  return prepared;
}

const ORG = "org_p11";
const PROJ = "proj_p11";
const CONV = "conv_p11";
const CANONICAL_URL = "data:image/png;base64,P11_CANONICAL_IMAGE_A";
const LEGACY_URL = "data:image/png;base64,P11_LEGACY_IMAGE_B";

function msg(
  partial: Partial<WorkingMemorySourceMessage> &
    Pick<WorkingMemorySourceMessage, "id" | "role" | "text" | "createdAt">,
): WorkingMemorySourceMessage {
  return {
    conversationId: partial.conversationId ?? CONV,
    channelId: partial.channelId ?? "ch_p11",
    ...partial,
  };
}

function startBrief() {
  const started = applyCdfTransition({
    action: "start",
    serviceId: "presentation",
    productMode: "ai",
    organizationId: ORG,
    projectId: PROJ,
  });
  if (!started.ok) throw new Error("start");
  const briefed = applyCdfTransition({
    action: "submit_brief",
    sessionId: started.value.session.sessionId,
    brief: "Create a 12-slide investor presentation.",
    expectedVersion: started.value.session.sessionVersion,
  });
  if (!briefed.ok) throw new Error("brief");
  return briefed.value.session;
}

function selectSource(session: ReturnType<typeof startBrief>) {
  const r = applyCdfTransition({
    action: "select_route",
    sessionId: session.sessionId,
    routeIndex: 2,
    routeTitle: "Start from Scratch",
    expectedVersion: session.sessionVersion,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value.session;
}

function largeStorylineData(marker: string) {
  const base = fixturePresentationStoryline();
  const pad = "PAD_".repeat(400);
  return {
    ...base,
    objective: `${marker} ${pad} OBJECTIVE_END`,
    narrativeStrategy: `${marker}_NARRATIVE ${pad}`,
    notes: `${marker}_NOTES ${pad}`,
    slides: [
      ...base.slides,
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `slide_extra_${i}`,
        order: 10 + i,
        title: `${marker}_SLIDE_${i}`,
        purpose: `Purpose ${i}`,
        keyMessage: `Key ${marker} ${i}`,
      })),
    ],
  };
}

function approveStorylineAtVersion(input: {
  session: ReturnType<typeof startBrief>;
  artifactId: string;
  version: number;
}) {
  markApproved(input.artifactId, input.version, {
    organizationId: ORG,
    projectId: PROJ,
  });
  const ap = applyCdfTransition({
    action: "approve",
    sessionId: input.session.sessionId,
    note: "OLD_NOTE_NOT_PAYLOAD",
    artifactId: input.artifactId,
    artifactVersion: input.version,
    expectedVersion: input.session.sessionVersion,
  });
  if (!ap.ok) throw new Error(ap.error.message);
  let session = upsertSessionArtifactRef(ap.value.session, {
    artifactId: input.artifactId,
    version: input.version,
    phaseId: "storyline",
    artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
    role: "approved",
  });
  saveCdfSession(session);
  return getCdfSession(session.sessionId)!;
}

function approveStorylineV1(sessionIn: ReturnType<typeof startBrief>, marker = "P11") {
  let session = sessionIn;
  const created = createArtifact({
    sessionId: session.sessionId,
    serviceId: "presentation",
    phaseId: "storyline",
    organizationId: ORG,
    projectId: PROJ,
    artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
    artifactType: "structured_doc",
    data: {
      ...fixturePresentationStoryline(),
      objective: marker,
    } as unknown as Record<string, unknown>,
    requestId: `p11_${marker}`,
  });
  markApproved(created.artifact.artifactId, 1, {
    organizationId: ORG,
    projectId: PROJ,
  });
  const ap = applyCdfTransition({
    action: "approve",
    sessionId: session.sessionId,
    note: "approve",
    artifactId: created.artifact.artifactId,
    artifactVersion: 1,
    expectedVersion: session.sessionVersion,
  });
  if (!ap.ok) throw new Error(ap.error.message);
  session = upsertSessionArtifactRef(ap.value.session, {
    artifactId: created.artifact.artifactId,
    version: 1,
    phaseId: "storyline",
    artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
    role: "approved",
  });
  saveCdfSession(session);
  return {
    session: getCdfSession(session.sessionId)!,
    artifactId: created.artifact.artifactId,
  };
}

describe("Phase 11 Model Runtime", () => {
  const prevFlag = process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];

  beforeEach(() => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
    resetCdfRequirementEngineForTests();
    resetCanonicalGenerationTracesForTests();
    resetContextOrchestratorTracesForTests();
    resetModelRuntimeTracesForTests();
  });

  afterAll(() => {
    if (prevFlag === undefined) {
      delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    } else {
      process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = prevFlag;
    }
  });

  it("1 — Model Runtime prepares CMR without provider call / storage lookup", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()));
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "CURRENT_CANONICAL_INSTRUCTION",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        apiExecutionId: "exec_p11_1",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");

    const spy = jest.spyOn(artifactRepo, "getArtifactVersion");
    const before = spy.mock.calls.length;
    const prepared = expectPreparedOk(prepareCanonicalModelRuntime({
      modelRequest: orch.modelRequest,
      metadata: orch.metadata,
      executionId: "exec_p11_1",
    }));
    expect(prepared.runtime.source).toBe(MODEL_RUNTIME_SOURCE);
    expect(prepared.runtime.representationStrategy).toBe(
      "cmr_compatibility_flatten",
    );
    expect(prepared.prompt).toContain("CURRENT_CANONICAL_INSTRUCTION");
    expect(prepared.metadataStamps.modelRuntimeApplied).toBe(true);
    expect(spy.mock.calls.length).toBe(before);
    spy.mockRestore();
  });

  it("2 — CRITICAL: canonical CMR wins over conflicting legacy B inputs", () => {
    let session = selectSource(startBrief());
    const MARKER = "P11_A5";
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: largeStorylineData(`${MARKER}_V1`) as unknown as Record<string, unknown>,
      requestId: "p11_conflict_seed",
    });
    let latest = created.version.version;
    for (let v = 2; v <= 5; v++) {
      const next = createVersion({
        artifactId: created.artifact.artifactId,
        expectedLatestVersion: latest,
        organizationId: ORG,
        projectId: PROJ,
        data: largeStorylineData(`${MARKER}_V${v}`) as unknown as Record<
          string,
          unknown
        >,
        requestId: `p11_c_v${v}`,
      });
      latest = next.version.version;
    }
    session = approveStorylineAtVersion({
      session,
      artifactId: created.artifact.artifactId,
      version: 5,
    });

    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "CURRENT_CANONICAL_INSTRUCTION",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        service: "Presentations",
        conversationId: CONV,
        multimodalAttachments: [
          {
            mimeType: "image/png",
            assetId: "asset_a",
            url: CANONICAL_URL,
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "wm_a",
          role: "user",
          text: "WORKING_MEMORY_A_evidence",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        msg({
          id: "wm_now",
          role: "user",
          text: "CURRENT_CANONICAL_INSTRUCTION",
          createdAt: "2026-01-01T00:01:00.000Z",
        }),
      ],
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");

    const prepared = expectPreparedOk(prepareCanonicalModelRuntime({
      modelRequest: orch.modelRequest,
      metadata: {
        ...orch.metadata,
        // Conflicting legacy-shaped fields — must not become SoT.
        legacyInstruction: "LEGACY_INSTRUCTION_B",
        conversationalEffectiveInstruction: "CTI_INSTRUCTION_B",
        assets: [{ url: LEGACY_URL, mimeType: "image/png" }],
      },
    }));
    expect(prepared.prompt).toContain("CURRENT_CANONICAL_INSTRUCTION");
    expect(prepared.prompt).not.toContain("LEGACY_INSTRUCTION_B");
    expect(prepared.prompt).toContain(`${MARKER}_V5`);
    expect(prepared.prompt).not.toContain("LEGACY_REQUIREMENTS_B");
    expect(prepared.prompt).toContain("WORKING_MEMORY_A_evidence");

    const adapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p11_conflict",
          providerId: "provider.openai",
          payload: {
            canonicalModelRequest: orch.modelRequest,
            assets: [{ url: LEGACY_URL, mimeType: "image/png" }],
            prompt: "LEGACY_INSTRUCTION_B",
          },
        }),
        capabilityId: "text.generate",
        modelId: "gpt-4o",
        metadata: orch.metadata,
      } as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    const wire = JSON.stringify(mapCanonicalToOpenAIRequest(adapter, "gpt-4o").body);
    expect(wire).toContain("CURRENT_CANONICAL_INSTRUCTION");
    expect(wire).toContain("P11_CANONICAL_IMAGE_A");
    expect(wire).not.toContain("P11_LEGACY_IMAGE_B");
    expect(wire).not.toContain("LEGACY_INSTRUCTION_B");
  });

  it("3 — exact A@5; runtime/mapper does not query A@6/HEAD", () => {
    let session = selectSource(startBrief());
    const MARKER = "P11_EXACT";
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: largeStorylineData(`${MARKER}_V1`) as unknown as Record<string, unknown>,
      requestId: "p11_exact",
    });
    let latest = created.version.version;
    for (let v = 2; v <= 5; v++) {
      const next = createVersion({
        artifactId: created.artifact.artifactId,
        expectedLatestVersion: latest,
        organizationId: ORG,
        projectId: PROJ,
        data: largeStorylineData(`${MARKER}_V${v}`) as unknown as Record<
          string,
          unknown
        >,
        requestId: `p11_ex_v${v}`,
      });
      latest = next.version.version;
    }
    session = approveStorylineAtVersion({
      session,
      artifactId: created.artifact.artifactId,
      version: 5,
    });
    createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 5,
      organizationId: ORG,
      projectId: PROJ,
      data: largeStorylineData(`${MARKER}_V6`) as unknown as Record<string, unknown>,
      requestId: "p11_ex_v6",
    });
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId: created.artifact.artifactId,
      version: 5,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);

    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use A@5.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");

    const exactSpy = jest.spyOn(artifactRepo, "getArtifactVersion");
    const latestSpy = jest.spyOn(artifactRepo, "getLatestArtifactVersion");
    const beforeExact = exactSpy.mock.calls.length;
    const prepared = expectPreparedOk(prepareCanonicalModelRuntime({
      modelRequest: orch.modelRequest,
      metadata: orch.metadata,
    }));
    expect(prepared.prompt).toContain(`${MARKER}_V5`);
    expect(prepared.prompt).not.toContain(`${MARKER}_V6`);
    expect(exactSpy.mock.calls.length).toBe(beforeExact);
    expect(latestSpy).not.toHaveBeenCalled();
    exactSpy.mockRestore();
    latestSpy.mockRestore();
  });

  it("4 — multimodal: canonical IMAGE_A wins over legacy IMAGE_B", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P11_MM");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use image.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        multimodalAttachments: [
          {
            mimeType: "image/png",
            assetId: "a",
            url: CANONICAL_URL,
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");
    const handoff = extractCanonicalMultimodalProviderHandoff(orch.modelRequest);
    expect(handoff.imageDeliveries[0]?.url).toBe(CANONICAL_URL);

    const adapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p11_mm",
          providerId: "provider.openai",
          payload: {
            canonicalModelRequest: orch.modelRequest,
            assets: [{ url: LEGACY_URL, mimeType: "image/png" }],
          },
        }),
        capabilityId: "text.generate",
        modelId: "gpt-4o",
        metadata: orch.metadata,
      } as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    const blob = JSON.stringify(mapCanonicalToOpenAIRequest(adapter, "gpt-4o").body);
    expect(blob).toContain("P11_CANONICAL_IMAGE_A");
    expect(blob).not.toContain("P11_LEGACY_IMAGE_B");
  });

  it("5 — Production Spec from CMR; legacy Spec B does not reinject", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P11_SPEC");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Generate slides.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        service: "Presentations",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");
    const specs = orch.modelRequest.messages
      .flatMap((m) => m.content)
      .filter((p) => p.type === "structured" && p.name === "production_spec");
    expect(specs.length).toBeLessThanOrEqual(1);
    expect(skipLegacyFromOrchestrator(orch.metadata)).toBe(true);
    const prepared = expectPreparedOk(prepareCanonicalModelRuntime({
      modelRequest: orch.modelRequest,
      metadata: {
        ...orch.metadata,
        productionSpecText: "PRODUCTION_SPEC_B_LEGACY",
      },
    }));
    // Representation comes from CMR flatten, not legacy Spec B string.
    expect(prepared.metadataStamps.productionSpecPresent).toBe(true);
    expect(prepared.prompt.includes("PRODUCTION_SPEC_B_LEGACY")).toBe(false);
  });

  it("6 — output contract from CMR; no second semantic assembly", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P11_OUT");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Generate slides.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        service: "Presentations",
        outputKind: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");
    const names = orch.modelRequest.messages
      .flatMap((m) => m.content)
      .filter((p) => p.type === "structured")
      .map((p) => (p.type === "structured" ? p.name : ""));
    expect(names).toContain("output_contract");
    const prepared = expectPreparedOk(prepareCanonicalModelRuntime({
      modelRequest: orch.modelRequest,
      metadata: {
        ...orch.metadata,
        legacyOutputRequirements: "OUTPUT_REQUIREMENTS_B",
      },
    }));
    expect(prepared.metadataStamps.outputContractPresent).toBe(true);
    expect(prepared.prompt).not.toContain("OUTPUT_REQUIREMENTS_B");
  });

  it("7 — CTI instruction B does not replace canonical instruction A", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P11_CTI");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "CDF_PHASE",
      conversationalInstruction: "CANONICAL_INSTRUCTION_A",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationalEffectiveInstruction: "CTI_INSTRUCTION_B",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");
    expect(orch.request.currentUserInstruction).toBe("CANONICAL_INSTRUCTION_A");
    const prepared = expectPreparedOk(prepareCanonicalModelRuntime({
      modelRequest: orch.modelRequest,
      metadata: orch.metadata,
    }));
    expect(prepared.prompt).toContain("CANONICAL_INSTRUCTION_A");
    expect(prepared.prompt).not.toContain("CTI_INSTRUCTION_B");
  });

  it("8 — same CMR maps to OpenAI and Anthropic without mutating CMR", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P11_PN");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "PROVIDER_NEUTRAL_CMR",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        multimodalAttachments: [
          { mimeType: "image/png", url: CANONICAL_URL, assetId: "pn" },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");
    const cmrBefore = orch.modelRequest;
    const cmrJsonBefore = JSON.stringify(cmrBefore);

    const oai = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p11_oai",
          providerId: "provider.openai",
          payload: { canonicalModelRequest: cmrBefore },
        }),
        capabilityId: "text.generate",
        modelId: "gpt-4o",
        metadata: orch.metadata,
      } as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    const anth = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p11_anth",
          providerId: "provider.anthropic",
          payload: { canonicalModelRequest: cmrBefore },
        }),
        capabilityId: "text.generate",
        modelId: "claude-3-5-sonnet",
        metadata: orch.metadata,
      } as never,
      canonicalProviderId: "provider.anthropic",
      adapterId: "anthropic",
      nowIso: new Date().toISOString(),
    });
    const oaiBody = JSON.stringify(mapCanonicalToOpenAIRequest(oai, "gpt-4o").body);
    const anthBody = JSON.stringify(
      mapCanonicalToAnthropicRequest(anth, "claude-3-5-sonnet").body,
    );
    expect(oaiBody).toContain("PROVIDER_NEUTRAL_CMR");
    expect(anthBody).toContain("PROVIDER_NEUTRAL_CMR");
    expect(JSON.stringify(cmrBefore)).toBe(cmrJsonBefore);
  });

  it("9 — flatten is representation-only; CMR identity unchanged", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P11_FLAT");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "FLAT_TEST",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");
    const before = orch.modelRequest;
    const prepared = expectPreparedOk(prepareCanonicalModelRuntime({
      modelRequest: before,
      metadata: orch.metadata,
    }));
    expect(assertModelRequestUnchanged(before, prepared.runtime.modelRequest)).toBe(
      true,
    );
    expect(prepared.runtime.representationStrategy).toBe(
      "cmr_compatibility_flatten",
    );
    // Flatten did not add new semantic resolution — only serialized existing parts.
    expect(prepared.prompt).toBe(
      flattenCanonicalModelRequestToLabeledPrompt(before),
    );
  });

  it("10 — flag OFF: Model Runtime not required; legacy prompt path", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    const { session } = approveStorylineV1(selectSource(startBrief()), "P11_OFF");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "LEGACY_PROMPT_UNCHANGED",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && orch.skipped).toBe(true);
    if (!orch.ok || !orch.skipped) throw new Error("expected skip");
    expect(orch.prompt).toBe("LEGACY_PROMPT_UNCHANGED");
    expect(orch.metadata.modelRuntimeApplied).toBeUndefined();
  });

  it("11 — live CDF runtime proof exercises Model Runtime boundary", async () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P11_LIVE");
    resetModelRuntimeTracesForTests();
    const proof = await runCanonicalGenerationRuntimeProof({
      prompt: "Generate",
      conversationalInstruction: "LIVE_CDF_RUNTIME_PROOF",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        service: "Presentations",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(proof.apply.ok).toBe(true);
    if (!proof.apply.ok || proof.apply.skipped) throw new Error("expected applied");
    expect(proof.engineOk).toBe(true);
    expect(proof.providerInvoked).toBe(true);
    expect(proof.providerPrompt).toContain("LIVE_CDF_RUNTIME_PROOF");
    const events = getModelRuntimeTraceEventsForTests();
    expect(events.some((e) => e.event === "ai.model_runtime.mapped")).toBe(true);
    const capturedMeta = proof.capturedRequests[0]?.metadata as
      | Record<string, unknown>
      | undefined;
    const capturedPayload = proof.capturedRequests[0]?.payload as
      | Record<string, unknown>
      | undefined;
    expect(
      capturedMeta?.modelRuntimeApplied === true ||
        capturedPayload?.modelRuntimeApplied === true ||
        capturedPayload?.canonicalModelRequestApplied === true,
    ).toBe(true);
  });

  it("12 — runtime trace is safe (no prompt/URLs/bodies)", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P11_TR");
    resetModelRuntimeTracesForTests();
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "SECRET_PROMPT_BODY_P11",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        apiExecutionId: "exec_p11_tr",
        multimodalAttachments: [
          {
            mimeType: "image/png",
            url: "https://signed.example/x?token=SECRET_TOKEN_P11",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");
    expectPreparedOk(prepareCanonicalModelRuntime({
      modelRequest: orch.modelRequest,
      metadata: orch.metadata,
      executionId: "exec_p11_tr",
    }));
    const blob = JSON.stringify(getModelRuntimeTraceEventsForTests());
    expect(blob).toContain("ai.model_runtime.mapped");
    expect(blob).not.toContain("SECRET_PROMPT_BODY_P11");
    expect(blob).not.toContain("SECRET_TOKEN_P11");
    expect(blob).not.toContain("signed.example");
  });

  it("13 — capability notes are explicit for omitted multimodal modalities", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P11_CAP");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use spreadsheet context.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        multimodalAttachments: [
          {
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename: "data.xlsx",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");
    const prepared = expectPreparedOk(prepareCanonicalModelRuntime({
      modelRequest: orch.modelRequest,
      metadata: orch.metadata,
    }));
    const omitted = prepared.runtime.capabilities.filter(
      (c) => c.state === "OMITTED_WITH_REASON",
    );
    expect(omitted.length).toBeGreaterThan(0);
  });

  it("14 — response normalization envelope preserves provider result", () => {
    const fake: ProviderExecutionResult = {
      requestId: "req_p11",
      sessionId: "sess",
      status: "succeeded" as never,
      success: true,
      response: {
        requestId: "req_p11",
        providerId: asProviderId("provider.openai"),
        output: { text: "hello", finishReason: "stop" },
        streamed: false,
        finishedAt: new Date().toISOString(),
        usage: { totalTokens: 3 },
      },
      statistics: {} as never,
      completedAt: new Date().toISOString(),
      finalProviderId: "provider.openai",
      finalModelId: "gpt-4o",
    };
    const normalized = normalizeProviderExecutionResult({ result: fake });
    expect(normalized.ok).toBe(true);
    expect(normalized.contentText).toBe("hello");
    expect(normalized.providerResult).toBe(fake);
    expect(normalized.source).toBe(MODEL_RUNTIME_SOURCE);
  });

  it("15 — provider error categorization is explicit", () => {
    expect(
      categorizeProviderRuntimeError({ message: "Request timed out" }).category,
    ).toBe("provider_timeout");
    expect(
      categorizeProviderRuntimeError({ message: "rate limit exceeded" }).category,
    ).toBe("provider_rate_limit");
    expect(
      categorizeProviderRuntimeError({ message: "invalid api key" }).category,
    ).toBe("provider_auth_config");
  });

  it("16 — working memory / references remain upstream-resolved in CMR", () => {
    const { session, artifactId } = approveStorylineV1(
      selectSource(startBrief()),
      "P11_WM",
    );
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: `Use ${artifactId}@1 carefully.`,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV,
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "m1",
          role: "user",
          text: "Prefer concise slides.",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        msg({
          id: "m2",
          role: "user",
          text: `Use ${artifactId}@1 carefully.`,
          createdAt: "2026-01-01T00:01:00.000Z",
        }),
      ],
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");
    const prepared = expectPreparedOk(prepareCanonicalModelRuntime({
      modelRequest: orch.modelRequest,
      metadata: orch.metadata,
    }));
    expect(prepared.prompt).toContain("WORKING MEMORY");
    expect(prepared.prompt).toContain("Prefer concise slides");
    // Runtime did not invent a second artifact load — upstream already in CMR.
    expect(prepared.prompt).toContain("UPSTREAM ARTIFACTS");
  });
});
