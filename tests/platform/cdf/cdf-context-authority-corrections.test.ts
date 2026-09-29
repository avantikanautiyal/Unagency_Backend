/**
 * Framework authority corrections — instruction SoT, brand identity,
 * brand-knowledge projection, CMR semantic surfaces.
 * Cross-service: presentation (text/structured) + packaging (visual) + social-media.
 */

import {
  applyCdfTransition,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  CDF_CANONICAL_CONTEXT_META,
  compileCanonicalGenerationRequest,
  compileCanonicalModelRequestFromGeneration,
  createArtifact,
  detectCanonicalSectionsFromModelRequest,
  fixturePresentationStoryline,
  getCdfSession,
  isBrandFactRelevantForProjection,
  markApproved,
  orchestrateCanonicalGenerationContext,
  PRESENTATION_ARTIFACT_KEYS,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveCanonicalBrandContextFromMetadata,
  resolveCanonicalConversationalInstruction,
  resolveCanonicalConversationalInstructionDetailed,
  saveCdfSession,
  tryApplyCanonicalGenerationContext,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import { inspectBrandIdentityAuthority } from "../../../src/platform/cdf/generation-context/resolve-brand-product-context";

const ORG = "org_auth_ctx";
const PROJ = "proj_auth_ctx";

beforeEach(() => {
  resetCdfSessionsForTests();
  resetCdfArtifactEngineForTests();
  resetCdfRequirementEngineForTests();
  process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
});

afterEach(() => {
  delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
});

function startPresentationBrief(brief = "Create a premium campaign presentation.") {
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
    brief,
    expectedVersion: started.value.session.sessionVersion,
  });
  if (!briefed.ok) throw new Error("brief");
  return briefed.value.session;
}

function selectScratch(session: ReturnType<typeof startPresentationBrief>) {
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

function pinStoryline(session: ReturnType<typeof selectScratch>, marker: string) {
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
    requestId: `auth_${marker}`,
  });
  markApproved(created.artifact.artifactId, 1, {
    organizationId: ORG,
    projectId: PROJ,
  });
  const approved = applyCdfTransition({
    action: "approve",
    sessionId: session.sessionId,
    artifactId: created.artifact.artifactId,
    artifactVersion: 1,
    expectedVersion: session.sessionVersion,
  });
  if (!approved.ok) throw new Error(approved.error.message);
  let s = upsertSessionArtifactRef(approved.value.session, {
    artifactId: created.artifact.artifactId,
    version: 1,
    phaseId: "storyline",
    artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
    role: "approved",
  });
  saveCdfSession(s);
  return getCdfSession(s.sessionId)!;
}

describe("canonical instruction authority", () => {
  it("A — raw current user beats CTI effective", () => {
    const session = pinStoryline(selectScratch(startPresentationBrief()), "A");
    const raw = "Make the campaign playful";
    const cti = "Create a professional campaign";

    const resolved = resolveCanonicalConversationalInstruction({
      conversationalCurrentUserInstruction: raw,
      conversationalEffectiveInstruction: cti,
    });
    expect(resolved).toBe(raw);

    const applied = tryApplyCanonicalGenerationContext({
      prompt: "PHASE_PROMPT",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationalCurrentUserInstruction: raw,
        conversationalEffectiveInstruction: cti,
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok && !("skipped" in applied && applied.skipped)).toBe(true);
    if (!applied.ok || ("skipped" in applied && applied.skipped)) {
      throw new Error("expected applied");
    }
    expect(applied.request.currentUserInstruction).toBe(raw);
    expect(applied.request.currentUserInstruction).not.toBe(cti);
    expect(applied.metadata[CDF_CANONICAL_CONTEXT_META.ctiEffectiveInstructionPresent]).toBe(
      true,
    );
    expect(applied.metadata[CDF_CANONICAL_CONTEXT_META.currentUserInstructionSource]).toBe(
      "conversationalCurrentUserInstruction",
    );

    const sections = detectCanonicalSectionsFromModelRequest(applied.modelRequest);
    expect(sections.currentUserInstruction).toBe(true);
    // CTI remains as advisory interpretation, not CURRENT USER INSTRUCTION.
    expect(sections.conversationalInterpretation).toBe(true);
    const advisory = applied.modelRequest.messages
      .flatMap((m) => m.content)
      .find(
        (p) => p.type === "structured" && p.name === "conversational_interpretation",
      );
    expect(advisory && advisory.type === "structured").toBe(true);
    if (advisory && advisory.type === "structured") {
      expect((advisory.data as { text?: string }).text).toBe(cti);
      expect(advisory.semanticRole).toBe("advisory_interpretation");
    }
  });

  it("B — refinePrompt beats raw current + CTI", () => {
    const session = pinStoryline(selectScratch(startPresentationBrief()), "B");
    const refine = "Use the new mango launch";
    const raw = "Previous campaign instruction";
    const cti = "Unrelated CTI interpretation";

    expect(
      resolveCanonicalConversationalInstruction({
        refinePrompt: refine,
        conversationalCurrentUserInstruction: raw,
        conversationalEffectiveInstruction: cti,
      }),
    ).toBe(refine);

    const orch = orchestrateCanonicalGenerationContext({
      prompt: "PHASE_PROMPT",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        refinePrompt: refine,
        conversationalCurrentUserInstruction: raw,
        conversationalEffectiveInstruction: cti,
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected");
    expect(orch.request.currentUserInstruction).toBe(refine);
    // Orchestrator resolves refine into conversationalInstruction (explicit_input);
    // resolver alone reports refinePrompt. Both prove refine won over CTI/raw.
    expect(
      ["refinePrompt", "explicit_input"].includes(
        String(orch.metadata[CDF_CANONICAL_CONTEXT_META.currentUserInstructionSource]),
      ),
    ).toBe(true);
    expect(orch.request.currentUserInstruction).not.toBe(raw);
    expect(orch.request.currentUserInstruction).not.toBe(cti);
  });

  it("C — CTI never silently becomes explicit user instruction", () => {
    const session = pinStoryline(selectScratch(startPresentationBrief()), "C");
    const phasePrompt = "PHASE_ONLY_PROMPT";
    const cti = "CTI_SHOULD_NOT_BECOME_EXPLICIT";

    const detailed = resolveCanonicalConversationalInstructionDetailed({
      conversationalEffectiveInstruction: cti,
    });
    expect(detailed.instruction).toBeUndefined();
    expect(detailed.source).toBe("none");
    expect(detailed.ctiEffectivePresent).toBe(true);

    const applied = tryApplyCanonicalGenerationContext({
      prompt: phasePrompt,
      // No conversationalInstruction, no refine, no current — only CTI.
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationalEffectiveInstruction: cti,
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok && !("skipped" in applied && applied.skipped)).toBe(true);
    if (!applied.ok || ("skipped" in applied && applied.skipped)) {
      throw new Error("expected applied");
    }
    // Falls back to phase prompt — not CTI.
    expect(applied.request.currentUserInstruction).toBe(phasePrompt);
    expect(applied.request.currentUserInstruction).not.toBe(cti);
    expect(applied.metadata[CDF_CANONICAL_CONTEXT_META.ctiEffectiveInstructionPresent]).toBe(
      true,
    );
    expect(applied.metadata[CDF_CANONICAL_CONTEXT_META.currentUserInstructionSource]).toBe(
      "phase_prompt",
    );
    // Distinguishes CURRENT USER INSTRUCTION from CONVERSATIONAL / CTI CONTEXT.
    expect(applied.request.conversationalInterpretation?.text).toBe(cti);
    expect(applied.request.conversationalInterpretation?.role).toBe(
      "advisory_cti_interpretation",
    );
  });
});

describe("selected brand identity authority", () => {
  it("selected brand remains authoritative; competitor extract does not replace name", () => {
    const meta = {
      brandId: "brand_bloomsip",
      brandName: "BloomSip",
      canonicalBrandName: "BloomSip",
      extractedBrandName: "Pepsi",
      extractedBrandEntities: ["Pepsi"],
      promptReferencedBrandNames: ["Pepsi"],
      brandExtractAttemptedIdentityMutation: true,
      brandContextPacket: {
        brandId: "brand_bloomsip",
        schemaVersion: "brand_context_packet.v0",
        assets: [],
        facts: [
          {
            key: "brandName",
            value: "Pepsi",
            tier: "working",
            provenance: "prompt_extraction",
          },
          {
            key: "positioning",
            value: "premium mango refreshment",
            tier: "canonical",
            provenance: "Brand profile",
          },
        ],
        negatives: [],
        provenanceLine: "BloomSip profile",
        budgets: { maxAssets: 4, maxFacts: 12, maxFactCardTokens: 400 },
        missingRequiredSlots: [],
      },
    };

    const identity = inspectBrandIdentityAuthority(meta);
    expect(identity.selectedBrandId).toBe("brand_bloomsip");
    expect(identity.selectedCanonicalBrandName).toBe("BloomSip");
    expect(identity.extractedBrandEntities).toContain("Pepsi");
    expect(identity.extractionAttemptedIdentityMutation).toBe(true);

    const brand = resolveCanonicalBrandContextFromMetadata(meta, {
      generationModality: "image",
      uxType: "generate",
    });
    expect(brand?.brandId).toBe("brand_bloomsip");
    expect(brand?.brandName).toBe("BloomSip");
    const nameFact = brand?.facts.find((f) => f.key === "brandName");
    expect(nameFact?.value).toBe("BloomSip");
    expect(nameFact?.value).not.toBe("Pepsi");
    const refs = brand?.facts.find((f) => f.key === "referencedBrandEntities");
    expect(refs?.value).toContain("Pepsi");
  });

  it("extracted brand enrichment does not mutate brandId", () => {
    const brand = resolveCanonicalBrandContextFromMetadata(
      {
        brandId: "brand_selected",
        brandName: "Selected Co",
        brandContextPacket: {
          brandId: "brand_from_packet_should_yield",
          schemaVersion: "brand_context_packet.v0",
          assets: [],
          facts: [{ key: "voice", value: "warm", tier: "canonical", provenance: "Brand profile" }],
          negatives: [],
          provenanceLine: "",
          budgets: { maxAssets: 4, maxFacts: 12, maxFactCardTokens: 400 },
          missingRequiredSlots: [],
        },
      },
      { generationModality: "text", uxType: "text_approval" },
    );
    expect(brand?.brandId).toBe("brand_selected");
  });
});

describe("brand knowledge projection", () => {
  it("persisted tone/positioning reaches CMR where copy-relevant", () => {
    const brand = resolveCanonicalBrandContextFromMetadata(
      {
        brandId: "b1",
        brandName: "Acme",
        brandContextPacket: {
          brandId: "b1",
          schemaVersion: "brand_context_packet.v0",
          assets: [],
          facts: [
            {
              key: "positioning",
              value: "calm botanical luxury",
              tier: "canonical",
              provenance: "Brand profile",
            },
            {
              key: "voice",
              value: "restrained, premium",
              tier: "canonical",
              provenance: "Brand profile",
            },
            {
              key: "typography",
              value: "Didot headlines",
              tier: "canonical",
              provenance: "Brand profile",
            },
            {
              key: "irrelevantDump",
              value: "should filter on none modality",
              tier: "working",
              provenance: "noise",
            },
          ],
          negatives: [],
          provenanceLine: "profile",
          budgets: { maxAssets: 4, maxFacts: 12, maxFactCardTokens: 400 },
          missingRequiredSlots: [],
        },
      },
      { generationModality: "text", uxType: "text_approval" },
    );
    expect(brand?.factKeys).toContain("positioning");
    expect(brand?.factKeys).toContain("voice");
    // Typography is visual-oriented — not required for pure text approval.
    expect(isBrandFactRelevantForProjection("typography", {
      generationModality: "text",
      uxType: "text_approval",
    })).toBe(false);
    expect(brand?.factKeys).not.toContain("typography");

    const request = compileCanonicalGenerationRequest({
      resolved: {
        contextId: "ctx",
        contextHash: "h",
        sessionId: "s",
        serviceId: "presentation",
        phaseId: "storyline",
        sessionVersion: 1,
        contextSource: "test",
        status: "ready",
        phaseContext: {
          phaseId: "storyline",
          serviceId: "presentation",
          name: "Storyline",
          uxType: "text_approval",
          generationModality: "text",
          artifactType: "structured",
          artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
          implementationStatus: "ready",
          dependencyPhaseIds: [],
          allowNonVisualReady: true,
          selectionMode: "none",
          approvalMode: "required",
          refinementEnabled: false,
          refinementScopes: [],
          entryMessage: "Write storyline",
          description: "Storyline",
          executionStrategy: "canonical",
        },
        activeRequirements: [],
        constraints: [],
        exclusions: [],
        selections: [],
        approvedDecisions: [],
        warnings: [],
        upstreamInputs: [],
        upstreamOutputs: [],
        missingDependencies: [],
        unresolvedConflicts: [],
        provenance: { requirementIds: [], artifactPins: [] },
      } as any,
      upstream: [],
      currentUserInstruction: "Make the visual language more playful and energetic",
      canonicalFullDeck: false,
      brandContext: brand,
    });
    const cmr = compileCanonicalModelRequestFromGeneration(request);
    const sections = detectCanonicalSectionsFromModelRequest(cmr);
    expect(sections.currentUserInstruction).toBe(true);
    expect(sections.brandContext).toBe(true);
    const brandPart = cmr.messages
      .flatMap((m) => m.content)
      .find((p) => p.type === "structured" && p.name === "brand_context");
    expect(brandPart && brandPart.type === "structured").toBe(true);
    if (brandPart && brandPart.type === "structured") {
      expect((brandPart.data as { note?: string }).note).toMatch(/CURRENT USER INSTRUCTION/i);
      expect(brandPart.semanticRole).toBe("brand_context");
    }
  });

  it("visual generation projects typography/style when available", () => {
    const brand = resolveCanonicalBrandContextFromMetadata(
      {
        brandId: "b2",
        brandName: "Nova",
        brandContextPacket: {
          brandId: "b2",
          schemaVersion: "brand_context_packet.v0",
          assets: [],
          facts: [
            {
              key: "typography",
              value: "Geometric sans",
              tier: "canonical",
              provenance: "Brand profile",
            },
            {
              key: "photographyStyle",
              value: "soft daylight product",
              tier: "canonical",
              provenance: "Brand profile",
            },
            {
              key: "colors",
              value: "#1A3A2A, #F5EDE0",
              tier: "canonical",
              provenance: "Brand profile",
            },
            {
              key: "campaignLook",
              value: "restrained premium visual language",
              tier: "working",
              provenance: "campaign memory",
            },
          ],
          negatives: [],
          provenanceLine: "visual",
          budgets: { maxAssets: 4, maxFacts: 12, maxFactCardTokens: 400 },
          missingRequiredSlots: [],
        },
      },
      { generationModality: "image", uxType: "generate" },
    );
    expect(brand?.factKeys).toEqual(
      expect.arrayContaining([
        "typography",
        "photographyStyle",
        "colors",
        "campaignLook",
      ]),
    );
    expect(brand?.factProvenance?.some((p) => p.provenance === "Brand profile")).toBe(
      true,
    );
  });

  it("irrelevant facts are not blindly dumped for modality=none", () => {
    expect(
      isBrandFactRelevantForProjection("photographyStyle", {
        generationModality: "none",
        uxType: "config",
      }),
    ).toBe(false);
    expect(
      isBrandFactRelevantForProjection("brandName", {
        generationModality: "none",
        uxType: "config",
      }),
    ).toBe(true);
  });
});

describe("priority: current user vs brand knowledge", () => {
  it("current instruction can override historical brand preference without erasing identity", () => {
    const session = pinStoryline(selectScratch(startPresentationBrief()), "P");
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction:
        "For this campaign, make the visual language more playful and energetic while keeping our core colors.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        brandId: "brand_bloomsip",
        brandName: "BloomSip",
        canonicalBrandName: "BloomSip",
        brandContextPacket: {
          brandId: "brand_bloomsip",
          schemaVersion: "brand_context_packet.v0",
          assets: [],
          facts: [
            {
              key: "brandName",
              value: "BloomSip",
              tier: "canonical",
              provenance: "Brand profile",
            },
            {
              key: "colors",
              value: "#FF6B00, #1A1A1A",
              tier: "canonical",
              provenance: "Brand profile",
            },
            {
              key: "campaignLook",
              value: "Use restrained, premium visual language.",
              tier: "working",
              provenance: "brand memory",
            },
          ],
          negatives: [],
          provenanceLine: "BloomSip",
          budgets: { maxAssets: 4, maxFacts: 12, maxFactCardTokens: 400 },
          missingRequiredSlots: [],
        },
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok && !("skipped" in applied && applied.skipped)).toBe(true);
    if (!applied.ok || ("skipped" in applied && applied.skipped)) {
      throw new Error("expected");
    }
    expect(applied.request.currentUserInstruction).toMatch(/playful and energetic/);
    expect(applied.request.brandContext?.brandId).toBe("brand_bloomsip");
    expect(applied.request.brandContext?.brandName).toBe("BloomSip");
    expect(
      applied.request.brandContext?.facts.some((f) => f.key === "campaignLook"),
    ).toBe(true);
    expect(
      applied.request.brandContext?.facts.some((f) => f.key === "colors"),
    ).toBe(true);

    const sections = detectCanonicalSectionsFromModelRequest(applied.modelRequest);
    expect(sections.currentUserInstruction).toBe(true);
    expect(sections.brandContext).toBe(true);
    // Distinct semantic surfaces — not one flattened blob.
    expect(sections.currentUserInstruction).not.toBe(sections.workingMemory);
  });
});

describe("cross-service brand projection contracts", () => {
  it("projects copy facts for packaging structured phase and visual facts for image modality", () => {
    const packet = {
      brandId: "brand_x",
      schemaVersion: "brand_context_packet.v0",
      assets: [],
      facts: [
        {
          key: "positioning",
          value: "shelf-winning mango",
          tier: "canonical",
          provenance: "Brand profile",
        },
        {
          key: "typography",
          value: "Bold condensed",
          tier: "canonical",
          provenance: "Brand profile",
        },
        {
          key: "illustrationStyle",
          value: "flat vector fruit",
          tier: "canonical",
          provenance: "Brand profile",
        },
      ],
      negatives: [],
      provenanceLine: "x",
      budgets: { maxAssets: 4, maxFacts: 12, maxFactCardTokens: 400 },
      missingRequiredSlots: [],
    };
    const meta = {
      brandId: "brand_x",
      brandName: "MangoCo",
      brandContextPacket: packet,
    };

    const packagingCopy = resolveCanonicalBrandContextFromMetadata(meta, {
      generationModality: "structured",
      uxType: "structured_approval",
    });
    expect(packagingCopy?.factKeys).toContain("positioning");

    const socialVisual = resolveCanonicalBrandContextFromMetadata(meta, {
      generationModality: "image",
      uxType: "generate",
    });
    expect(socialVisual?.factKeys).toEqual(
      expect.arrayContaining(["positioning", "typography", "illustrationStyle"]),
    );
  });
});
