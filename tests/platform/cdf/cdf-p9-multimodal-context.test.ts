/**
 * Phase 9 — Multimodal Context (canonical generation).
 */

import * as artifactRepo from "../../../src/platform/cdf/artifacts/repository";
import {
  applyCdfTransition,
  createArtifact,
  createVersion,
  detectCanonicalSectionsFromModelRequest,
  DOCX_MIME,
  fixturePresentationStoryline,
  getCdfSession,
  markApproved,
  PDF_MIME,
  PPTX_MIME,
  PRESENTATION_ARTIFACT_KEYS,
  projectMultimodalForProvider,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resetCanonicalGenerationTracesForTests,
  resolveCanonicalMultimodalContext,
  saveCdfSession,
  selectMultimodalContext,
  tryApplyCanonicalGenerationContext,
  upsertSessionArtifactRef,
  XLSX_MIME,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
} from "../../../src/platform/cdf";
import {
  CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER,
  flattenCanonicalModelRequestToLabeledPrompt,
  mapCanonicalModelRequestToProviderPayload,
} from "../../../src/platform/ai/canonical-model-request";
import { mapCanonicalToOpenAIRequest } from "../../../src/platform/providers/openai/requests/request-mapper";
import { mapCanonicalToAnthropicRequest } from "../../../src/platform/providers/anthropic/requests/request-mapper";
import { toAdapterRequestFromExecution } from "../../../src/platform/providers/common/to-adapter-request";
import { sampleRequest } from "../../../src/platform/providers/runtime/testing";
import type { WorkingMemorySourceMessage } from "../../../src/platform/ai/conversation-working-memory";

const ORG = "org_p9_mm";
const PROJ = "proj_p9_mm";
const CONV = "conv_p9_main";

function msg(
  partial: Partial<WorkingMemorySourceMessage> &
    Pick<WorkingMemorySourceMessage, "id" | "role" | "text" | "createdAt">,
): WorkingMemorySourceMessage {
  return {
    conversationId: partial.conversationId ?? CONV,
    channelId: partial.channelId ?? "ch_p9",
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

function approveStoryline(
  sessionIn: ReturnType<typeof startBrief>,
  data: Record<string, unknown>,
  requestId: string,
  version = 1,
) {
  let session = sessionIn;
  const created = createArtifact({
    sessionId: session.sessionId,
    serviceId: "presentation",
    phaseId: "storyline",
    organizationId: ORG,
    projectId: PROJ,
    artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
    artifactType: "structured_doc",
    data,
    requestId,
  });
  let latest = created.version.version;
  const artifactId = created.artifact.artifactId;
  for (let v = 2; v <= version; v++) {
    const next = createVersion({
      artifactId,
      expectedLatestVersion: latest,
      organizationId: ORG,
      projectId: PROJ,
      data: {
        ...data,
        objective:
          typeof data.objective === "string"
            ? `${String(data.objective)}_V${v}`
            : `V${v}`,
      },
      requestId: `${requestId}_v${v}`,
    });
    latest = next.version.version;
  }
  markApproved(artifactId, latest, { organizationId: ORG, projectId: PROJ });
  const ap = applyCdfTransition({
    action: "approve",
    sessionId: session.sessionId,
    note: "note_not_artifact",
    artifactId,
    artifactVersion: latest,
    expectedVersion: session.sessionVersion,
  });
  if (!ap.ok) throw new Error(ap.error.message);
  session = upsertSessionArtifactRef(ap.value.session, {
    artifactId,
    version: latest,
    phaseId: "storyline",
    artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
    role: "approved",
  });
  saveCdfSession(session);
  return {
    session: getCdfSession(session.sessionId)!,
    artifactId,
    version: latest,
  };
}

function adapterFromApply(
  applied: Extract<
    ReturnType<typeof tryApplyCanonicalGenerationContext>,
    { ok: true; skipped: false }
  >,
) {
  const execReq = {
    ...sampleRequest({
      requestId: "p9_wire",
      providerId: "provider.openai",
      payload: {
        canonicalModelRequest: applied.modelRequest,
        assets: applied.metadata.assets,
        image: applied.metadata.image,
      },
    }),
    capabilityId: "text.generate",
    modelId: "gpt-4o",
    metadata: applied.metadata,
  };
  return toAdapterRequestFromExecution({
    request: execReq as never,
    canonicalProviderId: "provider.openai",
    adapterId: "openai",
    nowIso: new Date().toISOString(),
  });
}

describe("Phase 9 Multimodal Context", () => {
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

  it("1 — ProductAsset image enters canonical multimodal context", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      {
        ...fixturePresentationStoryline(),
        objective: "P9_UPSTREAM_A",
      } as unknown as Record<string, unknown>,
      "p9_pa",
    );
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate slides",
      conversationalInstruction: "Use this brand image.",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        assets: [
          {
            assetId: "asset_brand_1",
            mimeType: "image/png",
            url: "data:image/png;base64,aaa",
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
    expect(applied.request.multimodalContext?.applied).toBe(true);
    expect(applied.request.multimodalContext?.imageCount).toBeGreaterThan(0);
    expect(applied.metadata.cdfMultimodalContextApplied).toBe(true);
    const flat = flattenCanonicalModelRequestToLabeledPrompt(applied.modelRequest);
    expect(flat).toContain("===== MULTIMODAL CONTEXT =====");
    expect(flat).toContain("image/png");
    expect(flat).toContain("logo.png");
  });

  it("2+3 — Chat/S3 image attachment + conversationId-scoped access", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      fixturePresentationStoryline() as unknown as Record<string, unknown>,
      "p9_chat_img",
    );
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use that image.",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
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
          text: "Here is a reference image.",
          createdAt: "2026-01-01T00:00:00.000Z",
          attachments: [
            {
              mimeType: "image/jpeg",
              fileName: "ref.jpg",
              url: "https://example.invalid/chat/ref.jpg",
              sizeBytes: 1200,
            },
          ],
        }),
      ],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    const item = applied.request.multimodalContext?.items.find(
      (i) => i.filename === "ref.jpg",
    );
    expect(item?.sourceType).toBe("chat_attachment");
    expect(item?.conversationId).toBe(CONV);
    expect(item?.messageId).toBe("m1");
    expect(
      (applied.metadata.assets as Array<{ url?: string }>).some(
        (a) => a.url === "https://example.invalid/chat/ref.jpg",
      ),
    ).toBe(true);
  });

  it("4 — unauthorized attachment cannot be loaded", () => {
    const ctx = selectMultimodalContext({
      organizationId: ORG,
      descriptors: [
        {
          sourceType: "product_asset",
          mimeType: "image/png",
          assetId: "foreign",
          organizationId: "org_other",
          url: "data:image/png;base64,x",
          hasVisualProviderRef: true,
        },
      ],
    });
    expect(
      ctx.items.some((i) => i.deliveryStatus === "unauthorized_skipped"),
    ).toBe(true);
    expect(JSON.stringify(ctx)).not.toContain("data:image/png;base64,x");
  });

  it("5 — PDF identity + MIME + extracted text", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      fixturePresentationStoryline() as unknown as Record<string, unknown>,
      "p9_pdf",
    );
    const EXTRACT = "PDF_EXTRACTED_BODY_" + "X".repeat(200);
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use the attached reference PDF to create the storyline.",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        multimodalAttachments: [
          {
            mimeType: PDF_MIME,
            filename: "report.pdf",
            attachmentId: "att_pdf_1",
            extractedText: EXTRACT,
            relationshipLabel: "current_user_turn",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    const pdf = applied.request.multimodalContext?.items.find(
      (i) => i.mimeType === PDF_MIME,
    );
    expect(pdf?.filename).toBe("report.pdf");
    expect(pdf?.extractedText).toContain("PDF_EXTRACTED_BODY_");
    expect(pdf?.deliveryStatus).toBe("extracted_text_only");
    const flat = flattenCanonicalModelRequestToLabeledPrompt(applied.modelRequest);
    expect(flat).toContain("report.pdf");
    expect(flat).toContain("extractedText (not original file)");
    expect(flat).toContain("PDF_EXTRACTED_BODY_");
  });

  it("6 — PPTX uses identity + extraction-unavailable note when no text", () => {
    const ctx = selectMultimodalContext({
      organizationId: ORG,
      descriptors: [
        {
          sourceType: "explicit_descriptor",
          mimeType: PPTX_MIME,
          filename: "deck.pptx",
          attachmentId: "att_pptx",
        },
      ],
    });
    const item = ctx.items[0]!;
    expect(item.mimeType).toBe(PPTX_MIME);
    expect(item.deliveryStatus).toBe("identity_only");
    expect(item.notes?.join(" ")).toMatch(/extracted text/i);
  });

  it("7 — DOCX identity + extracted text when provided", () => {
    const ctx = selectMultimodalContext({
      organizationId: ORG,
      descriptors: [
        {
          sourceType: "chat_attachment",
          mimeType: DOCX_MIME,
          filename: "brief.docx",
          extractedText: "DOCX_EXTRACTED_CONTENT",
        },
      ],
    });
    expect(ctx.items[0]?.extractedText).toBe("DOCX_EXTRACTED_CONTENT");
    expect(ctx.items[0]?.deliveryStatus).toBe("extracted_text_only");
  });

  it("8 — XLSX does not silently disappear", () => {
    const ctx = selectMultimodalContext({
      organizationId: ORG,
      descriptors: [
        {
          sourceType: "explicit_descriptor",
          mimeType: XLSX_MIME,
          filename: "sheet.xlsx",
          attachmentId: "att_xlsx",
        },
      ],
    });
    expect(ctx.applied).toBe(true);
    expect(ctx.spreadsheetCount).toBe(1);
    expect(ctx.items[0]?.deliveryStatus).toBe("unsupported_extraction");
    const proj = projectMultimodalForProvider({ context: ctx });
    expect(proj.omitted.some((o) => o.reason.includes("spreadsheet"))).toBe(
      true,
    );
  });

  it("9+10 — instruction unchanged; multimodal is separate CMR section", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      fixturePresentationStoryline() as unknown as Record<string, unknown>,
      "p9_instr",
    );
    const instruction = "Use this PDF to create the storyline.";
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: instruction,
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        multimodalAttachments: [
          {
            mimeType: PDF_MIME,
            filename: "a.pdf",
            extractedText: "body",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.request.currentUserInstruction).toBe(instruction);
    const sections = detectCanonicalSectionsFromModelRequest(applied.modelRequest);
    expect(sections.currentUserInstruction).toBe(true);
    expect(sections.multimodalContext).toBe(true);
    expect(sections.upstreamArtifacts).toBe(true);
  });

  it("11 — working memory does not become attachment source", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      fixturePresentationStoryline() as unknown as Record<string, unknown>,
      "p9_wm",
    );
    const WM = "Use the PDF I uploaded earlier.";
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Continue.",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        multimodalAttachments: [
          {
            mimeType: PDF_MIME,
            filename: "earlier.pdf",
            extractedText: "REAL_PDF_TEXT",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "w1",
          role: "user",
          text: WM,
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
          text: "Continue.",
          createdAt: "2026-01-01T00:02:00.000Z",
        }),
      ],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(JSON.stringify(applied.request.workingMemory)).toContain(WM);
    const mm = applied.request.multimodalContext?.items[0];
    expect(mm?.extractedText).toContain("REAL_PDF_TEXT");
    expect(mm?.extractedText).not.toContain(WM);
  });

  it("12+13 — deterministic metadata attachment resolves; unresolved does not invent", () => {
    const withMeta = resolveCanonicalMultimodalContext({
      organizationId: ORG,
      metadata: {
        multimodalAttachments: [
          {
            mimeType: "image/png",
            assetId: "asset_known",
            url: "data:image/png;base64,qq",
          },
        ],
      },
      referenceResolution: {
        applied: true,
        originalUserInstruction: "Use that image.",
        resolvedCount: 0,
        unresolvedCount: 1,
        ambiguousCount: 0,
        references: [
          {
            sourceText: "that image",
            referenceType: "deictic",
            targetType: "unknown",
            status: "unresolved",
            resolutionMethod: "unresolved",
            provenance: ["test"],
            reason: "no_deterministic_target",
          },
        ],
      },
    });
    expect(withMeta.items.some((i) => i.assetId === "asset_known")).toBe(true);
    expect(withMeta.items.every((i) => i.assetId !== "invented")).toBe(true);
  });

  it("14+24 — ArtifactVersion remains separate; PDF + A@5 + WM + instruction coexist", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      {
        ...fixturePresentationStoryline(),
        objective: "ARTIFACT_A5_PAYLOAD",
      } as unknown as Record<string, unknown>,
      "p9_e2e",
      5,
    );
    const instruction =
      "Use the attached reference PDF to create the storyline.";
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate storyline",
      conversationalInstruction: instruction,
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        multimodalAttachments: [
          {
            mimeType: PDF_MIME,
            filename: "reference.pdf",
            attachmentId: "att_ref",
            extractedText: "REFERENCE_PDF_EXTRACT",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "e1",
          role: "user",
          text: "Prefer a premium tone.",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        msg({
          id: "e2",
          role: "assistant",
          text: "Understood.",
          createdAt: "2026-01-01T00:01:00.000Z",
        }),
        msg({
          id: "e3",
          role: "user",
          text: instruction,
          createdAt: "2026-01-01T00:02:00.000Z",
        }),
      ],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.request.currentUserInstruction).toBe(instruction);
    expect(applied.request.upstreamArtifacts[0]?.version).toBe(5);
    expect(JSON.stringify(applied.request.upstreamArtifacts[0]?.data)).toContain(
      "ARTIFACT_A5_PAYLOAD",
    );
    expect(applied.request.multimodalContext?.items[0]?.filename).toBe(
      "reference.pdf",
    );
    expect(applied.request.workingMemory?.applied).toBe(true);
    const flat = flattenCanonicalModelRequestToLabeledPrompt(applied.modelRequest);
    expect(flat).toContain("===== CURRENT USER INSTRUCTION =====");
    expect(flat).toContain(instruction);
    expect(flat).toContain("===== WORKING MEMORY =====");
    expect(flat).toContain("===== MULTIMODAL CONTEXT =====");
    expect(flat).toContain("REFERENCE_PDF_EXTRACT");
    expect(flat).toContain("===== UPSTREAM ARTIFACTS =====");
    expect(flat).toContain("ARTIFACT_A5_PAYLOAD");
    // Attachment data must not be merged into upstream artifact payload.
    expect(
      JSON.stringify(applied.request.upstreamArtifacts[0]?.data),
    ).not.toContain("REFERENCE_PDF_EXTRACT");
  });

  it("15+16+17 — OpenAI / Anthropic / compat mapping receive multimodal context", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      fixturePresentationStoryline() as unknown as Record<string, unknown>,
      "p9_prov",
    );
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use image and PDF.",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        assets: [
          {
            assetId: "img1",
            mimeType: "image/png",
            url: "data:image/png;base64,abc",
            organizationId: ORG,
          },
        ],
        multimodalAttachments: [
          {
            mimeType: PDF_MIME,
            filename: "spec.pdf",
            extractedText: "SPEC_TEXT",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.prompt).toBe(CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER);

    const openaiAdapter = adapterFromApply(applied);
    const openaiWire = mapCanonicalToOpenAIRequest(openaiAdapter, "gpt-4o");
    const oaiMessages = (openaiWire.body as { messages: unknown[] }).messages;
    const oaiBlob = JSON.stringify(oaiMessages);
    expect(oaiBlob).toContain("SPEC_TEXT");
    expect(oaiBlob).toContain("MULTIMODAL CONTEXT");
    expect(oaiBlob).toContain("image_url");

    const anthAdapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p9_anth",
          providerId: "provider.anthropic",
          payload: {
            canonicalModelRequest: applied.modelRequest,
            assets: applied.metadata.assets,
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
    const anthWire = mapCanonicalToAnthropicRequest(
      anthAdapter,
      "claude-3-5-sonnet",
    );
    const anthBlob = JSON.stringify(anthWire.body);
    expect(anthBlob).toContain("SPEC_TEXT");
    expect(anthBlob).toMatch(/image|base64|url/i);

    // Compat uses OpenAI mapper.
    const compatWire = mapCanonicalToOpenAIRequest(openaiAdapter, "gpt-4o-mini");
    expect(JSON.stringify(compatWire.body)).toContain("SPEC_TEXT");
  });

  it("18 — unsupported provider capability is explicit (not silent)", () => {
    const ctx = selectMultimodalContext({
      organizationId: ORG,
      descriptors: [
        {
          sourceType: "explicit_descriptor",
          mimeType: XLSX_MIME,
          filename: "a.xlsx",
        },
        {
          sourceType: "product_asset",
          mimeType: "image/png",
          assetId: "img",
          url: "data:image/png;base64,x",
          hasVisualProviderRef: true,
        },
      ],
    });
    const proj = projectMultimodalForProvider({
      context: ctx,
      capabilities: {
        supportsImageInput: false,
        supportsPdfNativeInput: false,
        supportsDocumentInput: false,
        supportsSpreadsheetInput: false,
        supportsExtractedTextFallback: false,
      },
    });
    expect(proj.omitted.length).toBeGreaterThan(0);
    expect(proj.omitted.some((o) => o.reason.includes("image"))).toBe(true);
    expect(proj.mappedCount).toBe(0);
  });

  it("19 — provider mapping does not perform storage/artifact lookup", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      fixturePresentationStoryline() as unknown as Record<string, unknown>,
      "p9_nostore",
    );
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        assets: [
          {
            assetId: "img2",
            mimeType: "image/png",
            url: "data:image/png;base64,zz",
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
    mapCanonicalModelRequestToProviderPayload(applied.modelRequest);
    mapCanonicalToOpenAIRequest(adapterFromApply(applied), "gpt-4o");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("20 — signed/private storage refs are not logged in multimodal CMR parts", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      fixturePresentationStoryline() as unknown as Record<string, unknown>,
      "p9_nosign",
    );
    const SECRET = "https://signed.example/private?token=SECRET_TOKEN";
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        assets: [
          {
            assetId: "img3",
            mimeType: "image/png",
            url: SECRET,
            organizationId: ORG,
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    const mmPart = applied.modelRequest.messages
      .flatMap((m) => m.content)
      .find((p) => p.type === "structured" && p.name === "multimodal_context");
    expect(JSON.stringify(mmPart)).not.toContain("SECRET_TOKEN");
    expect(JSON.stringify(mmPart)).not.toContain(SECRET);
  });

  it("21+22 — size/type bounds and dedupe", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      sourceType: "explicit_descriptor" as const,
      mimeType: "image/png",
      filename: `f${i}.png`,
      assetId: `a${i}`,
      url: `data:image/png;base64,${i}`,
      hasVisualProviderRef: true,
    }));
    // duplicate
    many.push({ ...many[0]! });
    const ctx = selectMultimodalContext({
      organizationId: ORG,
      descriptors: many,
    });
    expect(ctx.items.length).toBeLessThanOrEqual(8);
    expect(ctx.truncated).toBe(true);
    const ids = ctx.items.map((i) => i.assetId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("23 — flag OFF preserves legacy behavior", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    const session = selectSource(startBrief());
    const legacy = "legacy prompt with attachment mention";
    const result = tryApplyCanonicalGenerationContext({
      prompt: legacy,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        assets: [{ mimeType: "image/png", url: "data:image/png;base64,x" }],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(true);
    expect(result.prompt).toBe(legacy);
    expect(result.metadata.cdfMultimodalContextApplied).toBeUndefined();
  });
});
