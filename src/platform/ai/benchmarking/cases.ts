/**
 * Phase 18 — Golden / catalog benchmark cases (declarative, reproducible).
 * Identities only — no private payloads.
 */

import {
  CDF_DEEP_INGEST_RUNTIME_SERVICES,
  inventoryCdfApplicationServices,
} from "../conversational-runtime/acceptance-matrix";
import type { BenchmarkCase, BenchmarkScenario } from "./types";

const CLASS_A = new Set<string>(CDF_DEEP_INGEST_RUNTIME_SERVICES);

const ALL_SCENARIOS: readonly BenchmarkScenario[] = [
  "LEGACY_BASELINE",
  "CANONICAL_GENERATION",
  "CANONICAL_WITH_QA",
  "CANONICAL_WITH_REPAIR",
];

const QA_SCENARIOS: readonly BenchmarkScenario[] = [
  "CANONICAL_GENERATION",
  "CANONICAL_WITH_QA",
  "CANONICAL_WITH_REPAIR",
];

function classAPresentationCases(): BenchmarkCase[] {
  const v = "1.0.0";
  const base = {
    serviceId: "presentation",
    classLabel: "A" as const,
    coverage: "benchmarked" as const,
    supportedScenarios: ALL_SCENARIOS,
    expectedContext: {
      currentInstruction: true,
      requirements: true,
      approvedDecisions: true,
      cdfContext: true,
      outputContract: true,
    },
  };

  return [
    {
      ...base,
      caseId: "presentation.source_to_storyline",
      phaseId: "storyline",
      actionId: "cdf.phase.presentation.storyline.generate",
      actionVersion: v,
      mode: "MULTI",
      expectedOutputContract: {
        kind: "generation_result",
        artifactKey: "presentation.storyline",
      },
      expectedUpstreamArtifacts: undefined,
      currentInstructionSummary: "Generate storyline from brief/source",
      fixtureRefs: ["GOLDEN_LEGACY_SOURCE", "GOLDEN_LEGACY_STORYLINE"],
      metadata: { continuity: "source→storyline" },
    },
    {
      ...base,
      caseId: "presentation.storyline_to_slide_content",
      phaseId: "slide-content",
      actionId: "cdf.phase.presentation.slide-content.generate",
      actionVersion: v,
      mode: "MULTI",
      expectedContext: {
        ...base.expectedContext,
        upstreamArtifact: true,
        resolvedReference: true,
        workingMemory: true,
      },
      expectedOutputContract: {
        kind: "generation_result",
        artifactKey: "presentation.slide_content",
      },
      expectedUpstreamArtifacts: [
        {
          artifactId: "art_storyline_golden",
          version: 1,
          structuredDataExpected: true,
        },
      ],
      expectedReferences: ["art_storyline_golden@1"],
      currentInstructionSummary: "Generate slide content from storyline",
      fixtureRefs: ["GOLDEN_LEGACY_STORYLINE", "GOLDEN_LEGACY_SLIDE_CONTENT"],
      metadata: { continuity: "storyline→slide-content" },
    },
    {
      ...base,
      caseId: "presentation.slide_content_to_design_routes",
      phaseId: "design-routes",
      actionId: "cdf.phase.presentation.design-routes.configure",
      actionVersion: v,
      mode: "MULTI",
      supportedScenarios: [
        "LEGACY_BASELINE",
        "CANONICAL_GENERATION",
        "CANONICAL_WITH_QA",
      ],
      unsupportedScenarios: ["CANONICAL_WITH_REPAIR"],
      unsupportedReason:
        "design-routes is deterministic configure (not MODEL_GENERATION)",
      expectedContext: {
        ...base.expectedContext,
        upstreamArtifact: true,
      },
      expectedOutputContract: {
        kind: "selection",
      },
      expectedUpstreamArtifacts: [
        {
          artifactId: "art_slide_content_golden",
          version: 2,
          structuredDataExpected: true,
        },
      ],
      fixtureRefs: ["GOLDEN_LEGACY_SLIDE_CONTENT", "GOLDEN_LEGACY_ROUTES"],
      metadata: {
        continuity: "slide-content→design-routes",
        criticalContinuity: true,
      },
    },
    {
      ...base,
      caseId: "presentation.design_routes_to_full_deck",
      phaseId: "full-deck",
      actionId: "cdf.phase.presentation.full-deck.generate",
      actionVersion: v,
      mode: "MULTI",
      expectedContext: {
        ...base.expectedContext,
        upstreamArtifact: true,
      },
      expectedOutputContract: {
        kind: "generation_result",
        artifactKey: "presentation.full_deck",
      },
      expectedUpstreamArtifacts: [
        {
          artifactId: "art_design_routes_golden",
          version: 1,
          structuredDataExpected: true,
        },
      ],
      fixtureRefs: ["GOLDEN_LEGACY_ROUTES", "GOLDEN_LEGACY_DESIGN_SYSTEM"],
      metadata: { continuity: "design-routes→full-deck" },
    },
    {
      ...base,
      caseId: "presentation.slide_refinement",
      phaseId: "slide-content",
      actionId: "cdf.phase.presentation.slide-content.generate",
      actionVersion: v,
      mode: "MULTI",
      expectedContext: {
        ...base.expectedContext,
        upstreamArtifact: true,
        workingMemory: true,
      },
      expectedOutputContract: {
        kind: "generation_result",
        artifactKey: "presentation.slide_content",
      },
      expectedUpstreamArtifacts: [
        {
          artifactId: "art_slide_content_golden",
          version: 2,
          structuredDataExpected: true,
        },
      ],
      fixtureRefs: ["GOLDEN_LEGACY_SLIDE_CONTENT"],
      metadata: { continuity: "refinement", refine: true },
    },
    {
      ...base,
      caseId: "presentation.final_materialization",
      phaseId: "final",
      actionId: "cdf.phase.presentation.final.materialize",
      actionVersion: v,
      mode: "MULTI",
      supportedScenarios: ["LEGACY_BASELINE", "CANONICAL_GENERATION", "CANONICAL_WITH_QA"],
      unsupportedScenarios: ["CANONICAL_WITH_REPAIR"],
      unsupportedReason: "Materialize path is non-LLM; repair N/A",
      expectedContext: {
        cdfContext: true,
        upstreamArtifact: true,
        outputContract: true,
      },
      expectedOutputContract: {
        kind: "export_result",
      },
      fixtureRefs: ["GOLDEN_LEGACY_DESIGN_SYSTEM"],
      metadata: { continuity: "final/materialization" },
    },
  ];
}

function classAPackagingCases(): BenchmarkCase[] {
  return [
    {
      caseId: "packaging.upstream_to_generation",
      serviceId: "packaging",
      phaseId: "routes",
      actionId: "cdf.phase.packaging.routes.generate",
      actionVersion: "1.0.0",
      mode: "MULTI",
      coverage: "benchmarked",
      classLabel: "A",
      expectedContext: {
        currentInstruction: true,
        cdfContext: true,
        upstreamArtifact: true,
        outputContract: true,
      },
      expectedOutputContract: { kind: "generation_result" },
      expectedUpstreamArtifacts: [
        {
          artifactId: "art_packaging_source",
          version: 1,
          structuredDataExpected: true,
        },
      ],
      supportedScenarios: QA_SCENARIOS,
      fixtureRefs: ["packaging_golden_upstream"],
      metadata: { continuity: "source→packaging" },
    },
  ];
}

function classASocialCases(): BenchmarkCase[] {
  return [
    {
      caseId: "social.upstream_to_generation",
      serviceId: "social-media",
      phaseId: "routes",
      actionId: "cdf.phase.social-media.routes.generate",
      actionVersion: "1.0.0",
      mode: "MULTI",
      coverage: "benchmarked",
      classLabel: "A",
      expectedContext: {
        currentInstruction: true,
        cdfContext: true,
        upstreamArtifact: true,
        outputContract: true,
      },
      expectedOutputContract: { kind: "generation_result" },
      expectedUpstreamArtifacts: [
        {
          artifactId: "art_social_source",
          version: 1,
          structuredDataExpected: true,
        },
      ],
      supportedScenarios: QA_SCENARIOS,
      fixtureRefs: ["social_golden_upstream"],
      metadata: { continuity: "source→social" },
    },
  ];
}

function classDCases(): BenchmarkCase[] {
  const services = inventoryCdfApplicationServices().filter(
    (s) => !CLASS_A.has(s.serviceId),
  );
  return services.map((svc) => {
    const phase =
      svc.firstUpstreamLlmPhaseId ??
      svc.firstLlmPhaseId ??
      svc.phases[0]?.phaseId ??
      "unknown";
    return {
      caseId: `classd.${svc.serviceId}.continuity_unsupported`,
      serviceId: svc.serviceId,
      phaseId: phase,
      actionId: `cdf.phase.${svc.serviceId}.${phase}.generate`,
      actionVersion: "1.0.0",
      mode: "CANONICAL_WITH_QA" as const,
      coverage: "unsupported" as const,
      classLabel: "D" as const,
      expectedContext: {
        currentInstruction: true,
        cdfContext: true,
        outputContract: true,
      },
      expectedOutputContract: { kind: "generation_result" },
      supportedScenarios: ["CANONICAL_WITH_QA"] as const,
      unsupportedScenarios: [
        "CANONICAL_WITH_REPAIR",
      ] as BenchmarkScenario[],
      unsupportedReason:
        "Class-D lacks deep ArtifactVersion ingest; continuity UNSUPPORTED not FAILED",
      metadata: {
        artifactContinuityComplete: false,
        expectQaStatus: "UNSUPPORTED",
      },
    };
  });
}

/** All catalog cases (Class A golden + Class D unsupported continuity). */
export function listBenchmarkCatalogCases(): BenchmarkCase[] {
  return [
    ...classAPresentationCases(),
    ...classAPackagingCases(),
    ...classASocialCases(),
    ...classDCases(),
  ];
}

export function getBenchmarkCase(caseId: string): BenchmarkCase | undefined {
  return listBenchmarkCatalogCases().find((c) => c.caseId === caseId);
}

export function classifyServiceCoverage(serviceId: string): {
  readonly coverage: BenchmarkCase["coverage"];
  readonly classLabel: BenchmarkCase["classLabel"];
} {
  if (CLASS_A.has(serviceId)) {
    return { coverage: "benchmarked", classLabel: "A" };
  }
  const known = inventoryCdfApplicationServices().some(
    (s) => s.serviceId === serviceId,
  );
  if (known) {
    return { coverage: "unsupported", classLabel: "D" };
  }
  return { coverage: "unsupported", classLabel: "other" };
}

export function listFifteenServiceCoverage(): readonly {
  readonly serviceId: string;
  readonly coverage: BenchmarkCase["coverage"];
  readonly classLabel: BenchmarkCase["classLabel"];
  readonly caseCount: number;
}[] {
  const cases = listBenchmarkCatalogCases();
  return inventoryCdfApplicationServices().map((s) => {
    const cls = classifyServiceCoverage(s.serviceId);
    return {
      serviceId: s.serviceId,
      ...cls,
      caseCount: cases.filter((c) => c.serviceId === s.serviceId).length,
    };
  });
}
