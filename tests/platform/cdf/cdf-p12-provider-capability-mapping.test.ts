/**
 * Phase 12 — Provider capability & mapping hardening.
 */

import { pinGeneratedForApprove } from "./helpers/bind-minimal-generated-for-approve";
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
  buildProviderRepresentationPlan,
  getModelRuntimeTraceEventsForTests,
  prepareCanonicalModelRuntime,
  resetModelRuntimeTracesForTests,
  resolveCmrProviderRepresentationProfile,
  type ModelRuntimePrepareResult,
} from "../../../src/platform/ai/model-runtime";
import { mapCanonicalToOpenAIRequest } from "../../../src/platform/providers/openai/requests/request-mapper";
import { mapCanonicalToAnthropicRequest } from "../../../src/platform/providers/anthropic/requests/request-mapper";
import { toAdapterRequestFromExecution } from "../../../src/platform/providers/common/to-adapter-request";
import { sampleRequest } from "../../../src/platform/providers/runtime/testing";
import type { WorkingMemorySourceMessage } from "../../../src/platform/ai/conversation-working-memory";

const ORG = "org_p12";
const PROJ = "proj_p12";
const CONV = "conv_p12";
const CANONICAL_URL = "data:image/png;base64,P12_CANONICAL_IMAGE_A";
const LEGACY_URL = "data:image/png;base64,P12_LEGACY_IMAGE_B";

function expectPreparedOk(
  prepared: ModelRuntimePrepareResult,
): Extract<ModelRuntimePrepareResult, { ok: true }> {
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) throw new Error(prepared.message);
  return prepared;
}

function msg(
  partial: Partial<WorkingMemorySourceMessage> &
    Pick<WorkingMemorySourceMessage, "id" | "role" | "text" | "createdAt">,
): WorkingMemorySourceMessage {
  return {
    conversationId: partial.conversationId ?? CONV,
    channelId: partial.channelId ?? "ch_p12",
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
  const pad = "PAD_".repeat(300);
  return {
    ...base,
    objective: `${marker} ${pad} OBJECTIVE_END`,
    narrativeStrategy: `${marker}_NARRATIVE ${pad}`,
    notes: `${marker}_NOTES ${pad}`,
    slides: [
      ...base.slides,
      ...Array.from({ length: 10 }, (_, i) => ({
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
  const pinnedVersion = pinGeneratedForApprove({
    sessionId: input.session.sessionId,
    artifactId: input.artifactId,
    version: input.version,
    phaseId: "storyline",
    artifactKey: "presentation.storyline",
  });
  const ap = applyCdfTransition({
    action: "approve",
    sessionId: input.session.sessionId,
    note: "OLD_NOTE",
    artifactId: input.artifactId,
    artifactVersion: input.version,
    expectedVersion: pinnedVersion,
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

function approveStorylineV1(sessionIn: ReturnType<typeof startBrief>, marker = "P12") {
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
    requestId: `p12_${marker}`,
  });
  markApproved(created.artifact.artifactId, 1, {
    organizationId: ORG,
    projectId: PROJ,
  });
  const pinnedVersion = pinGeneratedForApprove({
    sessionId: session.sessionId,
    artifactId: created.artifact.artifactId,
    version: 1,
    phaseId: "storyline",
    artifactKey: "presentation.storyline",
  });
  const ap = applyCdfTransition({
    action: "approve",
    sessionId: session.sessionId,
    note: "approve",
    artifactId: created.artifact.artifactId,
    artifactVersion: 1,
    expectedVersion: pinnedVersion,
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

describe("Phase 12 Provider Capability & Mapping", () => {
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

  it("1 — representation plan is deterministic for OpenAI", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P12_1");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "CANONICAL_INSTRUCTION_A",
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
    const plan = buildProviderRepresentationPlan({
      modelRequest: orch.modelRequest,
      providerId: "provider.openai",
      modelId: "gpt-4o",
    });
    expect(plan.providerFamily).toBe("openai");
    expect(plan.compatibilityCount).toBeGreaterThan(0);
    expect(
      plan.components.find((c) => c.component === "current_user_instruction")
        ?.status,
    ).toBe("SUPPORTED_VIA_COMPATIBILITY");
    expect(plan.requiredUnrepresentableCount).toBe(0);
  });

  it("2 — CMR immutability across plan + prepare", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P12_2");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "IMMUTABLE",
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
    const json = JSON.stringify(before);
    const plan = buildProviderRepresentationPlan({
      modelRequest: before,
      providerId: "provider.openai",
    });
    const prepared = expectPreparedOk(
      prepareCanonicalModelRuntime({
        modelRequest: before,
        providerId: "provider.openai",
        metadata: orch.metadata,
      }),
    );
    expect(assertModelRequestUnchanged(before, plan.modelRequest)).toBe(true);
    expect(assertModelRequestUnchanged(before, prepared.runtime.modelRequest)).toBe(
      true,
    );
    expect(JSON.stringify(before)).toBe(json);
  });

  it("3 — CRITICAL conflicting-source: canonical A wins over legacy B", () => {
    let session = selectSource(startBrief());
    const MARKER = "P12_A5";
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: largeStorylineData(`${MARKER}_V1`) as unknown as Record<string, unknown>,
      requestId: "p12_conflict",
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
        requestId: `p12_c_v${v}`,
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
      conversationalInstruction: "CANONICAL_INSTRUCTION_A",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        service: "Presentations",
        conversationId: CONV,
        multimodalAttachments: [
          { mimeType: "image/png", assetId: "a", url: CANONICAL_URL },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "wm",
          role: "user",
          text: "WM_A",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        msg({
          id: "now",
          role: "user",
          text: "CANONICAL_INSTRUCTION_A",
          createdAt: "2026-01-01T00:01:00.000Z",
        }),
      ],
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");
    const prepared = expectPreparedOk(
      prepareCanonicalModelRuntime({
        modelRequest: orch.modelRequest,
        providerId: "provider.openai",
        metadata: {
          ...orch.metadata,
          legacyInstruction: "LEGACY_INSTRUCTION_B",
          assets: [{ url: LEGACY_URL, mimeType: "image/png" }],
        },
      }),
    );
    expect(prepared.prompt).toContain("CANONICAL_INSTRUCTION_A");
    expect(prepared.prompt).toContain(`${MARKER}_V5`);
    expect(prepared.prompt).not.toContain("LEGACY_INSTRUCTION_B");
    const adapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p12_conflict",
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
    expect(wire).toContain("CANONICAL_INSTRUCTION_A");
    expect(wire).toContain("P12_CANONICAL_IMAGE_A");
    expect(wire).not.toContain("P12_LEGACY_IMAGE_B");
  });

  it("4 — exact A@5; capability/mapping does not query artifact repo", () => {
    let session = selectSource(startBrief());
    const MARKER = "P12_EX";
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: largeStorylineData(`${MARKER}_V1`) as unknown as Record<string, unknown>,
      requestId: "p12_ex",
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
        requestId: `p12_ex_v${v}`,
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
      requestId: "p12_ex_v6",
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
      conversationalInstruction: "Use A@5",
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
    const before = exactSpy.mock.calls.length;
    buildProviderRepresentationPlan({
      modelRequest: orch.modelRequest,
      providerId: "provider.openai",
    });
    expectPreparedOk(
      prepareCanonicalModelRuntime({
        modelRequest: orch.modelRequest,
        providerId: "provider.openai",
        metadata: orch.metadata,
      }),
    );
    expect(exactSpy.mock.calls.length).toBe(before);
    expect(latestSpy).not.toHaveBeenCalled();
    exactSpy.mockRestore();
    latestSpy.mockRestore();
  });

  it("5 — multimodal IMAGE_A vs IMAGE_B for OpenAI", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P12_MM");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use image",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        multimodalAttachments: [
          { mimeType: "image/png", url: CANONICAL_URL, assetId: "a" },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");
    const plan = buildProviderRepresentationPlan({
      modelRequest: orch.modelRequest,
      providerId: "provider.openai",
    });
    expect(
      plan.components.find((c) => c.component === "multimodal_context")?.status,
    ).toBe("SUPPORTED");
    const adapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p12_mm",
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
    expect(blob).toContain("P12_CANONICAL_IMAGE_A");
    expect(blob).not.toContain("P12_LEGACY_IMAGE_B");
  });

  it("6 — Production Spec A vs legacy Spec B", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P12_SPEC");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Generate",
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
    const plan = buildProviderRepresentationPlan({
      modelRequest: orch.modelRequest,
      providerId: "provider.openai",
    });
    expect(
      plan.components.find((c) => c.component === "production_spec")?.status,
    ).toBe("SUPPORTED_VIA_COMPATIBILITY");
    const prepared = expectPreparedOk(
      prepareCanonicalModelRuntime({
        modelRequest: orch.modelRequest,
        providerId: "provider.openai",
        metadata: { ...orch.metadata, productionSpecText: "SPEC_B_LEGACY" },
      }),
    );
    expect(prepared.prompt.includes("SPEC_B_LEGACY")).toBe(false);
  });

  it("7 — Output contract A vs legacy OUTPUT_B", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P12_OUT");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Generate",
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
    const prepared = expectPreparedOk(
      prepareCanonicalModelRuntime({
        modelRequest: orch.modelRequest,
        providerId: "provider.openai",
        metadata: {
          ...orch.metadata,
          legacyOutputRequirements: "OUTPUT_B",
        },
      }),
    );
    expect(prepared.prompt).not.toContain("OUTPUT_B");
    expect(prepared.metadataStamps.outputContractPresent).toBe(true);
  });

  it("8 — CTI instruction B does not replace canonical A", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P12_CTI");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "PHASE",
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
    const prepared = expectPreparedOk(
      prepareCanonicalModelRuntime({
        modelRequest: orch.modelRequest,
        providerId: "provider.openai",
        metadata: orch.metadata,
      }),
    );
    expect(prepared.prompt).toContain("CANONICAL_INSTRUCTION_A");
    expect(prepared.prompt).not.toContain("CTI_INSTRUCTION_B");
  });

  it("9 — provider parity: same CMR → OpenAI + Anthropic", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P12_PAR");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "PARITY_INSTRUCTION",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        multimodalAttachments: [
          { mimeType: "image/png", url: CANONICAL_URL, assetId: "p" },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");
    const cmrJson = JSON.stringify(orch.modelRequest);
    const oaiPlan = buildProviderRepresentationPlan({
      modelRequest: orch.modelRequest,
      providerId: "provider.openai",
    });
    const anthPlan = buildProviderRepresentationPlan({
      modelRequest: orch.modelRequest,
      providerId: "provider.anthropic",
    });
    expect(oaiPlan.requiredUnrepresentableCount).toBe(0);
    expect(anthPlan.requiredUnrepresentableCount).toBe(0);
    const oai = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p12_oai",
          providerId: "provider.openai",
          payload: { canonicalModelRequest: orch.modelRequest },
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
          requestId: "p12_anth",
          providerId: "provider.anthropic",
          payload: { canonicalModelRequest: orch.modelRequest },
        }),
        capabilityId: "text.generate",
        modelId: "claude-3-5-sonnet",
        metadata: orch.metadata,
      } as never,
      canonicalProviderId: "provider.anthropic",
      adapterId: "anthropic",
      nowIso: new Date().toISOString(),
    });
    expect(JSON.stringify(mapCanonicalToOpenAIRequest(oai, "gpt-4o").body)).toContain(
      "PARITY_INSTRUCTION",
    );
    expect(
      JSON.stringify(
        mapCanonicalToAnthropicRequest(anth, "claude-3-5-sonnet").body,
      ),
    ).toContain("PARITY_INSTRUCTION");
    expect(JSON.stringify(orch.modelRequest)).toBe(cmrJson);
  });

  it("10 — capability matrix: SUPPORTED / COMPAT / OMITTED / REQUIRED_UNREPRESENTABLE", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P12_MX");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Matrix",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        multimodalAttachments: [
          { mimeType: "image/png", url: CANONICAL_URL, assetId: "m" },
          {
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename: "x.xlsx",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");

    const openai = buildProviderRepresentationPlan({
      modelRequest: orch.modelRequest,
      providerId: "provider.openai",
    });
    expect(openai.supportedCount).toBeGreaterThan(0);
    expect(openai.compatibilityCount).toBeGreaterThan(0);
    expect(openai.omittedCount).toBeGreaterThan(0); // spreadsheet omit
    expect(openai.requiredUnrepresentableCount).toBe(0);

    const gemini = buildProviderRepresentationPlan({
      modelRequest: orch.modelRequest,
      providerId: "provider.gemini",
    });
    expect(gemini.requiredUnrepresentableCount).toBeGreaterThan(0);
    expect(
      gemini.components.some(
        (c) => c.status === "REQUIRED_BUT_UNREPRESENTABLE",
      ),
    ).toBe(true);

    const failed = prepareCanonicalModelRuntime({
      modelRequest: orch.modelRequest,
      providerId: "provider.gemini",
      metadata: orch.metadata,
    });
    expect(failed.ok).toBe(false);
    if (failed.ok) throw new Error("expected failure");
    expect(failed.code).toBe("REQUIRED_BUT_UNREPRESENTABLE");

    // Image providers with declarative REFERENCE_IMAGE must not hard-block —
    // they hand off via adapter-mediated reference images (fanout leaves).
    for (const imageProviderId of ["provider.google", "provider.ideogram"]) {
      const plan = buildProviderRepresentationPlan({
        modelRequest: orch.modelRequest,
        providerId: imageProviderId,
      });
      expect(plan.requiredUnrepresentableCount).toBe(0);
      const prepared = prepareCanonicalModelRuntime({
        modelRequest: orch.modelRequest,
        providerId: imageProviderId,
        metadata: orch.metadata,
      });
      expect(prepared.ok).toBe(true);
    }
  });

  it("11 — OpenAI-compatible reuses openai-family profile", () => {
    const profile = resolveCmrProviderRepresentationProfile("provider.mistral");
    expect(profile.family).toBe("openai_compatible");
    expect(profile.nativeCanonicalImageHandoff).toBe(true);
  });

  it("12 — Gemini/Cohere do NOT claim native CMR image handoff", () => {
    expect(
      resolveCmrProviderRepresentationProfile("provider.gemini")
        .nativeCanonicalImageHandoff,
    ).toBe(false);
    expect(
      resolveCmrProviderRepresentationProfile("provider.cohere")
        .nativeCanonicalImageHandoff,
    ).toBe(false);
  });

  it("13 — compatibility flattening classified explicitly", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P12_FLAT");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "FLAT",
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
    const prepared = expectPreparedOk(
      prepareCanonicalModelRuntime({
        modelRequest: orch.modelRequest,
        providerId: "provider.openai",
        metadata: orch.metadata,
      }),
    );
    expect(prepared.runtime.representationStrategy).toBe(
      "cmr_compatibility_flatten",
    );
    expect(prepared.metadataStamps.compatibilityFlattenOccurred ?? true).toBe(
      true,
    );
    expect(prepared.prompt).toBe(
      flattenCanonicalModelRequestToLabeledPrompt(orch.modelRequest),
    );
  });

  it("14 — working memory / references remain upstream-resolved", () => {
    const { session, artifactId } = approveStorylineV1(
      selectSource(startBrief()),
      "P12_WM",
    );
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: `Use ${artifactId}@1`,
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
          text: "Prefer concise",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        msg({
          id: "m2",
          role: "user",
          text: `Use ${artifactId}@1`,
          createdAt: "2026-01-01T00:01:00.000Z",
        }),
      ],
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");
    const plan = buildProviderRepresentationPlan({
      modelRequest: orch.modelRequest,
      providerId: "provider.openai",
    });
    expect(
      plan.components.find((c) => c.component === "working_memory")?.status,
    ).toBe("SUPPORTED_VIA_COMPATIBILITY");
    expect(
      plan.components.find((c) => c.component === "upstream_artifact")?.status,
    ).toBe("SUPPORTED_VIA_COMPATIBILITY");
  });

  it("15 — flag OFF unchanged", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    const { session } = approveStorylineV1(selectSource(startBrief()), "P12_OFF");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "LEGACY_PROMPT",
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
    expect(orch.prompt).toBe("LEGACY_PROMPT");
  });

  it("16 — live CDF runtime proof exercises capability boundary", async () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P12_LIVE");
    resetModelRuntimeTracesForTests();
    const proof = await runCanonicalGenerationRuntimeProof({
      prompt: "Generate",
      conversationalInstruction: "LIVE_P12_CAPABILITY",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        service: "Presentations",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(proof.apply.ok && !proof.apply.skipped).toBe(true);
    expect(proof.engineOk).toBe(true);
    expect(proof.providerPrompt).toContain("LIVE_P12_CAPABILITY");
    const events = getModelRuntimeTraceEventsForTests();
    expect(events.some((e) => e.event === "ai.model_runtime.mapped")).toBe(true);
    const mapped = events.find((e) => e.event === "ai.model_runtime.mapped");
    expect(mapped?.capabilityAssessmentApplied).toBe(true);
  });

  it("17 — capability/representation trace is safe", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P12_TR");
    resetModelRuntimeTracesForTests();
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "SECRET_P12_PROMPT",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        multimodalAttachments: [
          {
            mimeType: "image/png",
            url: "https://signed.example/t?token=SECRET_P12",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");
    expectPreparedOk(
      prepareCanonicalModelRuntime({
        modelRequest: orch.modelRequest,
        providerId: "provider.openai",
        metadata: orch.metadata,
        executionId: "exec_p12_tr",
      }),
    );
    const blob = JSON.stringify(getModelRuntimeTraceEventsForTests());
    expect(blob).toContain("capabilityAssessmentApplied");
    expect(blob).not.toContain("SECRET_P12_PROMPT");
    expect(blob).not.toContain("SECRET_P12");
  });

  it("18 — Anthropic multimodal handoff remains Phase 9A canonical", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P12_AN");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use image",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        multimodalAttachments: [
          { mimeType: "image/png", url: CANONICAL_URL, assetId: "an" },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected applied");
    expect(
      extractCanonicalMultimodalProviderHandoff(orch.modelRequest).imageDeliveries[0]
        ?.url,
    ).toBe(CANONICAL_URL);
    const plan = buildProviderRepresentationPlan({
      modelRequest: orch.modelRequest,
      providerId: "provider.anthropic",
    });
    expect(
      plan.components.find((c) => c.component === "multimodal_context")?.status,
    ).toBe("SUPPORTED");
  });

  it("19 — silent loss prevention: present sections get explicit status", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P12_SL");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Present",
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
    const plan = buildProviderRepresentationPlan({
      modelRequest: orch.modelRequest,
      providerId: "provider.openai",
    });
    for (const c of plan.components.filter((x) => x.presentInCmr)) {
      expect([
        "SUPPORTED",
        "SUPPORTED_VIA_COMPATIBILITY",
        "OMITTED_WITH_REASON",
        "REQUIRED_BUT_UNREPRESENTABLE",
      ]).toContain(c.status);
    }
  });
});
