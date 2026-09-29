/**
 * Phase 9A — Canonical multimodal provider handoff.
 * Provider vision input must come from CMR.multimodal_context, not metadata.assets.
 */

import * as artifactRepo from "../../../src/platform/cdf/artifacts/repository";
import {
  applyCdfTransition,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  createArtifact,
  fixturePresentationStoryline,
  getCdfSession,
  markApproved,
  PDF_MIME,
  PRESENTATION_ARTIFACT_KEYS,
  resetCanonicalGenerationTracesForTests,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  saveCdfSession,
  tryApplyCanonicalGenerationContext,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import {
  CANONICAL_MULTIMODAL_MAPPING_SOURCE,
  extractCanonicalMultimodalProviderHandoff,
  flattenCanonicalModelRequestToLabeledPrompt,
} from "../../../src/platform/ai/canonical-model-request";
import { mapCanonicalToOpenAIRequest } from "../../../src/platform/providers/openai/requests/request-mapper";
import { mapCanonicalToAnthropicRequest } from "../../../src/platform/providers/anthropic/requests/request-mapper";
import { toAdapterRequestFromExecution } from "../../../src/platform/providers/common/to-adapter-request";
import { sampleRequest } from "../../../src/platform/providers/runtime/testing";
import type { WorkingMemorySourceMessage } from "../../../src/platform/ai/conversation-working-memory";

const ORG = "org_p9a";
const PROJ = "proj_p9a";
const CONV = "conv_p9a";

const CANONICAL_URL = "data:image/png;base64,CANONICAL_IMAGE_A_MARKER";
const LEGACY_URL = "data:image/png;base64,LEGACY_IMAGE_B_SHOULD_NOT_WIN";

function msg(
  partial: Partial<WorkingMemorySourceMessage> &
    Pick<WorkingMemorySourceMessage, "id" | "role" | "text" | "createdAt">,
): WorkingMemorySourceMessage {
  return {
    conversationId: partial.conversationId ?? CONV,
    channelId: partial.channelId ?? "ch_p9a",
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

function approveStoryline(sessionIn: ReturnType<typeof startBrief>) {
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
      objective: "P9A_UPSTREAM_A5",
    } as unknown as Record<string, unknown>,
    requestId: "p9a_story",
  });
  markApproved(created.artifact.artifactId, 1, {
    organizationId: ORG,
    projectId: PROJ,
  });
  const ap = applyCdfTransition({
    action: "approve",
    sessionId: session.sessionId,
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
  return getCdfSession(session.sessionId)!;
}

describe("Phase 9A Canonical Multimodal Provider Handoff", () => {
  const prevFlag = process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCanonicalGenerationTracesForTests();
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
  });

  afterAll(() => {
    if (prevFlag === undefined) {
      delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    } else {
      process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = prevFlag;
    }
  });

  it("1+4 — ProductAsset / CMR image reaches OpenAI from canonical context", () => {
    const session = approveStoryline(selectSource(startBrief()));
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use this brand image.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        assets: [
          {
            assetId: "asset_brand_a",
            mimeType: "image/png",
            url: CANONICAL_URL,
            organizationId: ORG,
            filename: "logo.png",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    const handoff = extractCanonicalMultimodalProviderHandoff(applied.modelRequest);
    expect(handoff.applied).toBe(true);
    expect(handoff.mappingSource).toBe(CANONICAL_MULTIMODAL_MAPPING_SOURCE);
    expect(handoff.imageDeliveries[0]?.url).toBe(CANONICAL_URL);

    const execReq = {
      ...sampleRequest({
        requestId: "p9a_oai",
        providerId: "provider.openai",
        payload: {
          canonicalModelRequest: applied.modelRequest,
          // Conflicting legacy assets must not win.
          assets: [{ mimeType: "image/png", url: LEGACY_URL }],
        },
      }),
      capabilityId: "text.generate",
      modelId: "gpt-4o",
      metadata: applied.metadata,
    };
    const adapter = toAdapterRequestFromExecution({
      request: execReq as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    const wire = mapCanonicalToOpenAIRequest(adapter, "gpt-4o");
    const blob = JSON.stringify(wire.body);
    expect(blob).toContain("CANONICAL_IMAGE_A_MARKER");
    expect(blob).not.toContain("LEGACY_IMAGE_B_SHOULD_NOT_WIN");
    expect(blob).toContain("image_url");
  });

  it("2 — Anthropic receives canonical CMR image (not conflicting assets)", () => {
    const session = approveStoryline(selectSource(startBrief()));
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use image.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        assets: [
          {
            assetId: "asset_a",
            mimeType: "image/png",
            url: CANONICAL_URL,
            organizationId: ORG,
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");

    const adapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p9a_anth",
          providerId: "provider.anthropic",
          payload: {
            canonicalModelRequest: applied.modelRequest,
            assets: [{ mimeType: "image/png", url: LEGACY_URL }],
          },
        }),
        capabilityId: "text.generate",
        modelId: "claude-3-5-sonnet",
        metadata: applied.metadata,
      } as never,
      canonicalProviderId: "provider.anthropic",
      adapterId: "anthropic",
      nowIso: new Date().toISOString(),
    });
    const wire = mapCanonicalToAnthropicRequest(adapter, "claude-3-5-sonnet");
    const blob = JSON.stringify(wire.body);
    expect(blob).toContain("CANONICAL_IMAGE_A_MARKER");
    expect(blob).not.toContain("LEGACY_IMAGE_B_SHOULD_NOT_WIN");
  });

  it("3 — OpenAI-compatible path preserves canonical mapping", () => {
    const session = approveStoryline(selectSource(startBrief()));
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        assets: [
          {
            assetId: "asset_compat",
            mimeType: "image/png",
            url: CANONICAL_URL,
            organizationId: ORG,
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    const adapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p9a_compat",
          providerId: "provider.openai",
          payload: {
            canonicalModelRequest: applied.modelRequest,
            assets: [{ url: LEGACY_URL, mimeType: "image/png" }],
          },
        }),
        capabilityId: "text.generate",
        modelId: "gpt-4o-mini",
        metadata: applied.metadata,
      } as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    // Compat reuses OpenAI mapper.
    const wire = mapCanonicalToOpenAIRequest(adapter, "gpt-4o-mini");
    expect(JSON.stringify(wire.body)).toContain("CANONICAL_IMAGE_A_MARKER");
    expect(JSON.stringify(wire.body)).not.toContain("LEGACY_IMAGE_B_SHOULD_NOT_WIN");
  });

  it("5 — chat attachment uses canonical source", () => {
    const session = approveStoryline(selectSource(startBrief()));
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use that image.",
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
          text: "reference",
          createdAt: "2026-01-01T00:00:00.000Z",
          attachments: [
            {
              mimeType: "image/jpeg",
              fileName: "chat.jpg",
              url: CANONICAL_URL,
            },
          ],
        }),
      ],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    const delivery = applied.request.multimodalContext?.items[0]?.providerDelivery;
    expect(delivery?.url).toBe(CANONICAL_URL);
    const adapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p9a_chat",
          providerId: "provider.openai",
          payload: {
            canonicalModelRequest: applied.modelRequest,
            assets: [{ url: LEGACY_URL, mimeType: "image/png" }],
          },
        }),
        capabilityId: "text.generate",
        modelId: "gpt-4o",
        metadata: applied.metadata,
      } as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    expect(JSON.stringify(mapCanonicalToOpenAIRequest(adapter, "gpt-4o").body)).toContain(
      "CANONICAL_IMAGE_A_MARKER",
    );
  });

  it("6 — CRITICAL: canonical CMR wins over conflicting metadata.assets", () => {
    const session = approveStoryline(selectSource(startBrief()));
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use image A.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        // Only canonical A enters multimodal resolution / CMR.
        multimodalAttachments: [
          {
            mimeType: "image/png",
            filename: "canonical-a.png",
            assetId: "asset_a",
            url: CANONICAL_URL,
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");

    // CMR item is A.
    expect(
      applied.request.multimodalContext?.items[0]?.providerDelivery?.url,
    ).toBe(CANONICAL_URL);
    expect(
      applied.request.multimodalContext?.items.every(
        (i) => i.providerDelivery?.url !== LEGACY_URL,
      ),
    ).toBe(true);

    // Even if adapter input.assets / metadata.assets is only legacy B, mapper must use CMR A.
    const adapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p9a_conflict",
          providerId: "provider.openai",
          payload: {
            canonicalModelRequest: applied.modelRequest,
            assets: [{ mimeType: "image/png", url: LEGACY_URL }],
            image: { mimeType: "image/png", url: LEGACY_URL },
          },
        }),
        capabilityId: "text.generate",
        modelId: "gpt-4o",
        metadata: {
          ...applied.metadata,
          assets: [{ mimeType: "image/png", url: LEGACY_URL }],
        },
      } as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    const oai = JSON.stringify(mapCanonicalToOpenAIRequest(adapter, "gpt-4o").body);
    expect(oai).toContain("CANONICAL_IMAGE_A_MARKER");
    expect(oai).not.toContain("LEGACY_IMAGE_B_SHOULD_NOT_WIN");

    const anth = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p9a_conflict_anth",
          providerId: "provider.anthropic",
          payload: {
            canonicalModelRequest: applied.modelRequest,
            assets: [{ mimeType: "image/png", url: LEGACY_URL }],
          },
        }),
        capabilityId: "text.generate",
        modelId: "claude-3-5-sonnet",
        metadata: {
          ...applied.metadata,
          assets: [{ mimeType: "image/png", url: LEGACY_URL }],
        },
      } as never,
      canonicalProviderId: "provider.anthropic",
      adapterId: "anthropic",
      nowIso: new Date().toISOString(),
    });
    const anthBlob = JSON.stringify(
      mapCanonicalToAnthropicRequest(anth, "claude-3-5-sonnet").body,
    );
    expect(anthBlob).toContain("CANONICAL_IMAGE_A_MARKER");
    expect(anthBlob).not.toContain("LEGACY_IMAGE_B_SHOULD_NOT_WIN");
  });

  it("7 — provider mapping does not perform storage lookup", () => {
    const session = approveStoryline(selectSource(startBrief()));
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        assets: [
          {
            assetId: "asset_x",
            mimeType: "image/png",
            url: CANONICAL_URL,
            organizationId: ORG,
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    const spy = jest.spyOn(artifactRepo, "getArtifactVersion");
    const adapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p9a_nostore",
          providerId: "provider.openai",
          payload: { canonicalModelRequest: applied.modelRequest },
        }),
        capabilityId: "text.generate",
        modelId: "gpt-4o",
        metadata: applied.metadata,
      } as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    mapCanonicalToOpenAIRequest(adapter, "gpt-4o");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("8 — unsupported image without delivery is explicit omit", () => {
    const handoff = extractCanonicalMultimodalProviderHandoff({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "structured",
              name: "multimodal_context",
              data: {
                items: [
                  {
                    itemId: "img_no_delivery",
                    modality: "image",
                    mimeType: "image/png",
                    deliveryStatus: "identity_only",
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(handoff.mappedCount).toBe(0);
    expect(handoff.omitted[0]?.reason).toBe(
      "canonical_image_delivery_unavailable",
    );
  });

  it("9–12+14 — PDF + WM + Artifact + instruction remain separate; mapping source stamped", () => {
    const session = approveStoryline(selectSource(startBrief()));
    const instruction =
      "Use the attached reference PDF to create the storyline.";
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: instruction,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        multimodalAttachments: [
          {
            mimeType: PDF_MIME,
            filename: "reference.pdf",
            extractedText: "REFERENCE_PDF_EXTRACT_P9A",
          },
        ],
        assets: [
          {
            assetId: "img_side",
            mimeType: "image/png",
            url: CANONICAL_URL,
            organizationId: ORG,
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "w1",
          role: "user",
          text: "Prefer premium tone.",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        msg({
          id: "w2",
          role: "assistant",
          text: "Ok.",
          createdAt: "2026-01-01T00:01:00.000Z",
        }),
        msg({
          id: "w3",
          role: "user",
          text: instruction,
          createdAt: "2026-01-01T00:02:00.000Z",
        }),
      ],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.request.currentUserInstruction).toBe(instruction);
    expect(applied.request.workingMemory?.applied).toBe(true);
    expect(applied.request.upstreamArtifacts[0]?.data).toBeTruthy();
    expect(
      JSON.stringify(applied.request.upstreamArtifacts[0]?.data),
    ).not.toContain("REFERENCE_PDF_EXTRACT_P9A");
    const flat = flattenCanonicalModelRequestToLabeledPrompt(applied.modelRequest);
    expect(flat).toContain("===== CURRENT USER INSTRUCTION =====");
    expect(flat).toContain("===== WORKING MEMORY =====");
    expect(flat).toContain("===== MULTIMODAL CONTEXT =====");
    expect(flat).toContain("REFERENCE_PDF_EXTRACT_P9A");
    expect(flat).toContain("===== UPSTREAM ARTIFACTS =====");
    expect(applied.metadata.cdfCanonicalMultimodalMappingSource).toBe(
      "cmr_multimodal_context",
    );

    const adapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p9a_e2e",
          providerId: "provider.openai",
          payload: {
            canonicalModelRequest: applied.modelRequest,
            assets: [{ url: LEGACY_URL, mimeType: "image/png" }],
          },
        }),
        capabilityId: "text.generate",
        modelId: "gpt-4o",
        metadata: applied.metadata,
      } as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    const wire = mapCanonicalToOpenAIRequest(adapter, "gpt-4o");
    const blob = JSON.stringify(wire.body);
    expect(blob).toContain("CANONICAL_IMAGE_A_MARKER");
    expect(blob).toContain("REFERENCE_PDF_EXTRACT_P9A");
    expect(blob).not.toContain("LEGACY_IMAGE_B_SHOULD_NOT_WIN");
  });

  it("13 — flag OFF legacy behavior unchanged", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    const session = selectSource(startBrief());
    const legacy = "legacy prompt";
    const result = tryApplyCanonicalGenerationContext({
      prompt: legacy,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        assets: [{ url: CANONICAL_URL, mimeType: "image/png" }],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(true);
    expect(result.prompt).toBe(legacy);
    expect(result.metadata.cdfCanonicalMultimodalMappingSource).toBeUndefined();
  });
});
