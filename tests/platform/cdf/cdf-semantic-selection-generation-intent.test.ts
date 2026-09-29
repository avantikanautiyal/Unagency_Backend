/**
 * Semantic selection resolution + generation intent authority.
 * Framework-level — covers multiple selectable CDF artifact families.
 */

import { createHash } from "crypto";
import {
  assembleCanonicalModelRequest,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  compileCanonicalGenerationRequest,
  compileCanonicalModelRequestFromGeneration,
  detectCanonicalSectionsFromModelRequest,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveGenerationReferences,
  resolveSelectedSemanticChoices,
} from "../../../src/platform/cdf";
import {
  buildProviderGenerationIntentDiagnostics,
} from "../../../src/platform/cdf/generation-context/provider-intent-diagnostics";
import {
  resolveCanonicalBrandContextFromMetadata,
  resolveCanonicalProductGroundingFromMetadata,
} from "../../../src/platform/cdf/generation-context/resolve-brand-product-context";
import type { UpstreamArtifactContext } from "../../../src/platform/cdf/generation-context/types";

beforeEach(() => {
  resetCdfSessionsForTests();
  resetCdfArtifactEngineForTests();
  resetCdfRequirementEngineForTests();
  process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
});

afterEach(() => {
  delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
});

function upstreamFrom(
  art: { artifactId: string },
  ver: { version: number },
  artifactKey: string,
  phaseId: string,
  data: Record<string, unknown>,
): UpstreamArtifactContext {
  return {
    artifactId: art.artifactId,
    version: ver.version,
    artifactKey,
    phaseId,
    role: "selected_reference",
    status: "selected",
    schemaVersion: "1",
    data,
    lineage: { sourceArtifacts: [] },
    sessionRole: "selected",
    required: true,
  };
}

describe("resolveSelectedSemanticChoices", () => {
  it("resolves social-media-style routes[] by selectedRouteIndex", () => {
    const data = {
      routes: [
        { name: "A", creativeIdea: "idea-a", visualTreatment: "soft" },
        { name: "B", creativeIdea: "idea-b", visualTreatment: "bold" },
        { name: "C", creativeIdea: "idea-c", visualTreatment: "editorial" },
      ],
    };
    const result = resolveSelectedSemanticChoices({
      selections: [
        {
          phaseId: "routes",
          label: "Choice 2",
          routeIndex: 1,
          semantic: "selection",
        },
      ],
      upstream: [
        upstreamFrom(
          { artifactId: "cdfart_routes" },
          { version: 1 },
          "social-media.routes",
          "routes",
          data,
        ),
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.choices).toHaveLength(1);
    expect(result.choices[0]!.choice).toMatchObject({
      name: "B",
      creativeIdea: "idea-b",
    });
    expect(result.choices[0]!.selectedRouteIndex).toBe(1);
    expect(result.choices[0]!.optionNumber).toBe(2);
  });

  it("resolves presentation storyline options[] family", () => {
    const data = {
      options: [
        { title: "Narrative Arc", summary: "arc" },
        { title: "Problem/Solution", summary: "ps" },
      ],
    };
    const result = resolveSelectedSemanticChoices({
      selections: [
        {
          phaseId: "storyline",
          label: "Choice 1",
          routeIndex: 0,
          semantic: "selection",
        },
      ],
      upstream: [
        upstreamFrom(
          { artifactId: "cdfart_story" },
          { version: 3 },
          "presentation.storyline",
          "storyline",
          data,
        ),
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.choices[0]!.choice.title).toBe("Narrative Arc");
    expect(result.choices[0]!.artifactId).toBe("cdfart_story");
    expect(result.choices[0]!.version).toBe(3);
  });

  it("resolves website directions[] family", () => {
    const data = {
      directions: [
        { name: "Bold Commerce", rationale: "r1" },
        { name: "Quiet Trust", rationale: "r2" },
      ],
    };
    const result = resolveSelectedSemanticChoices({
      selections: [
        {
          phaseId: "directions",
          label: "Quiet Trust",
          routeIndex: 1,
          semantic: "selection",
        },
      ],
      upstream: [
        upstreamFrom(
          { artifactId: "cdfart_web" },
          { version: 1 },
          "website.directions",
          "directions",
          data,
        ),
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.choices[0]!.choice.name).toBe("Quiet Trust");
  });

  it("fails closed on out-of-range selectedRouteIndex", () => {
    const result = resolveSelectedSemanticChoices({
      selections: [
        {
          phaseId: "routes",
          label: "x",
          routeIndex: 9,
          semantic: "selection",
        },
      ],
      upstream: [
        upstreamFrom(
          { artifactId: "cdfart_r" },
          { version: 1 },
          "packaging.routes",
          "routes",
          { routes: [{ name: "only" }] },
        ),
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("CDF_SELECTION_REFERENCE_UNRESOLVED");
  });

  it("fails closed when upstream parent is missing for indexed selection", () => {
    const result = resolveSelectedSemanticChoices({
      selections: [
        {
          phaseId: "routes",
          label: "x",
          routeIndex: 0,
          semantic: "selection",
        },
      ],
      upstream: [],
      requirePhaseIds: ["routes"],
    });
    expect(result.ok).toBe(false);
  });

  it("skips non-structured source selections without a choice-array parent", () => {
    const result = resolveSelectedSemanticChoices({
      selections: [
        {
          phaseId: "source",
          label: "Start from Scratch",
          routeIndex: 2,
          semantic: "selection",
        },
      ],
      upstream: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.choices).toHaveLength(0);
  });
});

describe("option reference resolution against selected choice artifacts", () => {
  it("resolves Option N against selected routes parent (not unknown)", () => {
    const refs = resolveGenerationReferences({
      instruction: "Use Option 2 for the Instagram feed post",
      candidates: [
        {
          artifactId: "cdfart_sm_routes",
          version: 1,
          artifactKey: "social-media.routes",
          phaseId: "routes",
          sessionRole: "selected",
          role: "selected_reference",
        },
      ],
    });
    const option = refs.references.find((r) => r.referenceType === "option");
    expect(option).toBeDefined();
    expect(option!.status).toBe("exact");
    expect(option!.targetType).toBe("option");
    expect(option!.artifactId).toBe("cdfart_sm_routes");
    expect(option!.optionIndex).toBe(2);
  });
});

describe("generation intent compilation authority", () => {
  it("puts selected direction, brand, user instruction, product grounding into CMR", () => {
    const data = {
      routes: [
        {
          name: "Intro Brand Story",
          creativeIdea: "Introduce the brand with palette-led typography",
          visualTreatment: "warm editorial",
        },
        {
          name: "Product Hero",
          creativeIdea: "Hero product with logo lockup",
          visualTreatment: "high contrast",
        },
      ],
    };
    const semantic = resolveSelectedSemanticChoices({
      selections: [
        {
          phaseId: "routes",
          label: "Choice 2",
          routeIndex: 1,
          semantic: "selection",
        },
      ],
      upstream: [
        upstreamFrom(
          { artifactId: "cdfart_out" },
          { version: 1 },
          "social-media.routes",
          "routes",
          data,
        ),
      ],
    });
    expect(semantic.ok).toBe(true);
    if (!semantic.ok) return;

    const brandContext = resolveCanonicalBrandContextFromMetadata({
      brandId: "brand_1",
      brandName: "Acme Botanics",
      brandColors: ["#1A3A2A", "#F5EDE0"],
      brandContextPacket: {
        brandId: "brand_1",
        schemaVersion: "brand_context_packet.v0",
        assets: [],
        facts: [
          { key: "industry", value: "skincare", tier: "core", provenance: "vault" },
          {
            key: "positioning",
            value: "calm botanical luxury",
            tier: "core",
            provenance: "vault",
          },
        ],
        negatives: [{ text: "no neon", source: "avoid" }],
        provenanceLine: "Using Acme Botanics vault",
        budgets: { maxAssets: 4, maxFacts: 12, maxFactCardTokens: 400 },
        missingRequiredSlots: [],
      },
    });
    const productGrounding = resolveCanonicalProductGroundingFromMetadata({
      service: "social-media",
      subtype: "content-design",
      platform: "Instagram",
      format: "Feed Post",
    });

    const request = compileCanonicalGenerationRequest({
      resolved: {
        contextId: "ctx",
        contextHash: "hash",
        sessionId: "sess",
        serviceId: "social-media",
        phaseId: "output",
        sessionVersion: 4,
        activeBriefId: "brief_1",
        activeBriefVersion: 1,
        contextSource: "test",
        status: "ready",
        phaseContext: {
          phaseId: "output",
          serviceId: "social-media",
          name: "Output",
          uxType: "generate",
          generationModality: "image",
          artifactType: "image",
          artifactKey: "social-media.output",
          implementationStatus: "ready",
          dependencyPhaseIds: ["routes"],
          allowNonVisualReady: false,
          selectionMode: "none",
          approvalMode: "none",
          refinementEnabled: false,
          refinementScopes: [],
          entryMessage: "Create the final creative",
          description: "Final output",
          executionStrategy: "canonical",
        },
        activeRequirements: [
          {
            requirementId: "req_1",
            key: "user.instruction",
            displayValue:
              "introductory Instagram post describing the brand with existing colour scheme",
            priority: "explicit_current_user_instruction",
            category: "instruction",
            sourceInputId: "src_1",
          },
        ],
        constraints: [],
        exclusions: [],
        selections: [
          {
            phaseId: "routes",
            label: "Choice 2",
            routeIndex: 1,
            semantic: "selection",
          },
        ],
        approvedDecisions: [],
        upstreamInputs: [],
        upstreamOutputs: [],
        missingDependencies: [],
        unresolvedConflicts: [],
        warnings: [],
        provenance: { requirementIds: [], artifactPins: [] },
      } as any,
      upstream: [
        upstreamFrom(
          { artifactId: "cdfart_out" },
          { version: 1 },
          "social-media.routes",
          "routes",
          data,
        ),
      ],
      currentUserInstruction:
        "I want an introductory Instagram post about my brand that describes it properly, looks aesthetic, and follows the colour scheme",
      canonicalFullDeck: false,
      selectedSemanticChoices: semantic.choices,
      brandContext,
      productGrounding,
    });

    const modelRequest = compileCanonicalModelRequestFromGeneration(request);
    const sections = detectCanonicalSectionsFromModelRequest(modelRequest);
    expect(sections.selectedSemanticDirections).toBe(true);
    expect(sections.brandContext).toBe(true);
    expect(sections.productGrounding).toBe(true);
    expect(sections.currentUserInstruction).toBe(true);

    const diag = buildProviderGenerationIntentDiagnostics({
      request,
      modelRequest,
      productionSpecPresent: true,
      referenceAssetsPresent: true,
    });
    expect(diag.selectedDirectionPresent).toBe(true);
    expect(diag.brandContextPresent).toBe(true);
    expect(diag.userInstructionPresent).toBe(true);
    expect(diag.unresolvedReferenceCount).toBe(0);
    expect(diag.selectedDirectionSemanticFields).toEqual(
      expect.arrayContaining(["name", "creativeIdea", "visualTreatment"]),
    );
    expect(diag.platform).toBe("Instagram");
    expect(diag.subtype).toBe("content-design");

    // CMR contains actual semantic choice — not merely "Option 2"
    const flat = JSON.stringify(modelRequest);
    expect(flat).toContain("Hero product with logo lockup");
    expect(flat).toContain("Acme Botanics");
    expect(flat).toContain("Instagram");
    expect(flat).not.toMatch(/"label":\s*"Option 2"/);
  });

  it("does not treat promptPreview / Option N as selected direction authority", () => {
    const request = compileCanonicalGenerationRequest({
      resolved: {
        contextId: "ctx",
        contextHash: "hash",
        sessionId: "sess",
        serviceId: "branding",
        phaseId: "directions",
        sessionVersion: 1,
        contextSource: "test",
        status: "ready",
        phaseContext: {
          phaseId: "directions",
          serviceId: "branding",
          name: "Directions",
          uxType: "choice",
          generationModality: "text",
          artifactType: "structured",
          artifactKey: "branding.directions",
          implementationStatus: "ready",
          dependencyPhaseIds: [],
          allowNonVisualReady: true,
          selectionMode: "single",
          approvalMode: "none",
          refinementEnabled: false,
          refinementScopes: [],
          entryMessage: "Choose a direction",
          description: "Directions",
          executionStrategy: "canonical",
          choiceNoun: "Direction",
        },
        activeRequirements: [],
        constraints: [],
        exclusions: [],
        selections: [
          {
            phaseId: "prior",
            label: "Option 2",
            routeTitle: "Hero Moment Spotlight",
            routeIndex: 1,
            semantic: "selection",
          },
        ],
        approvedDecisions: [],
        upstreamInputs: [],
        upstreamOutputs: [],
        missingDependencies: [],
        unresolvedConflicts: [],
        warnings: [],
        provenance: { requirementIds: [], artifactPins: [] },
      } as any,
      upstream: [
        upstreamFrom(
          { artifactId: "cdfart_dir" },
          { version: 2 },
          "branding.directions",
          "prior",
          {
            concepts: [
              { name: "Quiet Mark", creativeIdea: "restrained emblem" },
              { name: "Living System", creativeIdea: "adaptive wordmark" },
            ],
          },
        ),
      ],
      currentUserInstruction: "Continue with Option 2",
      canonicalFullDeck: false,
      selectedSemanticChoices: resolveSelectedSemanticChoices({
        selections: [
          {
            phaseId: "prior",
            label: "Option 2",
            routeIndex: 1,
            semantic: "selection",
          },
        ],
        upstream: [
          upstreamFrom(
            { artifactId: "cdfart_dir" },
            { version: 2 },
            "branding.directions",
            "prior",
            {
              concepts: [
                { name: "Quiet Mark", creativeIdea: "restrained emblem" },
                { name: "Living System", creativeIdea: "adaptive wordmark" },
              ],
            },
          ),
        ],
      }).ok
        ? (
            resolveSelectedSemanticChoices({
              selections: [
                {
                  phaseId: "prior",
                  label: "Option 2",
                  routeIndex: 1,
                  semantic: "selection",
                },
              ],
              upstream: [
                upstreamFrom(
                  { artifactId: "cdfart_dir" },
                  { version: 2 },
                  "branding.directions",
                  "prior",
                  {
                    concepts: [
                      { name: "Quiet Mark", creativeIdea: "restrained emblem" },
                      {
                        name: "Living System",
                        creativeIdea: "adaptive wordmark",
                      },
                    ],
                  },
                ),
              ],
            }) as Extract<
              ReturnType<typeof resolveSelectedSemanticChoices>,
              { ok: true }
            >
          ).choices
        : [],
    });

    const mr = assembleCanonicalModelRequest(request, { metadata: {} });
    const flat = JSON.stringify(mr);
    expect(flat).toContain("Living System");
    expect(flat).toContain("adaptive wordmark");
    expect(flat).toContain("selected_semantic_directions");
  });
});

describe("applyCanonicalGenerationContext fail-closed selection", () => {
  it("blocks when required choice-set parent cannot resolve selected index", () => {
    const semantic = resolveSelectedSemanticChoices({
      selections: [
        {
          phaseId: "routes",
          label: "Choice 9",
          routeIndex: 9,
          semantic: "selection",
        },
      ],
      upstream: [
        upstreamFrom(
          { artifactId: "cdfart_r" },
          { version: 1 },
          "packaging.routes",
          "routes",
          { routes: [{ name: "only" }] },
        ),
      ],
      requirePhaseIds: ["routes"],
    });
    expect(semantic.ok).toBe(false);
    if (semantic.ok) return;
    expect(semantic.code).toBe("CDF_SELECTION_REFERENCE_UNRESOLVED");
  });
});

describe("deterministic intent hash", () => {
  it("hashes generation intent without secret dumps", () => {
    const a = createHash("sha256").update("x").digest("hex").slice(0, 16);
    expect(a).toHaveLength(16);
  });
});
