/**
 * Deterministic CDF execution certification harness.
 *
 * Enumerates ALL registry phases via listCdfCanonicalServiceIds +
 * resolveCdfCanonicalService / countCdfCanonicalPhases — never hardcodes phase IDs.
 *
 * No serviceId / phaseId semantic branches in the runner beyond registry lookup.
 * Fixtures are modality / artifactType / structuredOutputContract-name driven only.
 * Fixtures only — no live provider credits.
 */

import {
  countCdfCanonicalPhases,
  listCdfCanonicalServiceIds,
  nextWorkForPhase,
  resolveCdfCanonicalService,
  resolveCdfPhaseExecutionContract,
  type CdfPhaseDefinition,
} from "../canonical";
import {
  bindGenericCanonicalAttach,
  tryIngestCanonicalCdfCompletion,
  type GenericCanonicalIngestKind,
} from "../canonical-ingest";
import { getCdfSession, saveCdfSession } from "../session-store";
import { createArtifact, getArtifactVersion } from "../artifacts";
import {
  applyArtifactEngineOnApprove,
  applyArtifactEngineOnSelect,
} from "../artifacts/session-adapter";
import {
  fixturePresentationDeck,
  fixturePresentationDesignSystem,
  fixturePresentationSlideContent,
  fixturePresentationStoryline,
} from "../artifacts/presentation/fixtures";
import {
  fixturePackaging3dDirection,
  fixturePackagingCompletePack,
  fixturePackagingDieline,
  fixturePackagingFrontPack,
  fixturePackagingRoutes,
  fixturePackagingSkuAdaptations,
  fixturePackagingViews,
} from "../artifacts/packaging/fixtures";
import {
  fixtureSocialMediaOutput,
  fixtureSocialMediaPlatform,
  fixtureSocialMediaRoutes,
  fixtureSocialMediaSizeReference,
} from "../artifacts/social-media/fixtures";
import { deriveVisualVerificationRequirements } from "../generation-validation/visual-verification-requirements";
import { CDF_STRUCTURED_APPROVAL_DOC_SCHEMA_ID } from "../../os/delivery/cdf-structured-approval-schemas";
import type { CdfSessionArtifactRef, CdfSessionState } from "../types";
import { resolveDeliverableCompositionContract } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";

export const EXECUTION_CERT_ORG_ID = "6a8d8d7dc263a4d6afe69691";
export const EXECUTION_CERT_VAULT_ID = "507f1f77bcf86cd799439011";

/**
 * Certification levels (do not conflate):
 * - CONTRACT_WIRED: registry/contract resolves; no deterministic execution proof
 * - EXECUTION_CERTIFIED: deterministic fixture/runtime plumbing proved
 * - LIVE_PROVIDER_CERTIFIED: real provider execution proved (never assigned here)
 * - FAILED: deterministic harness could not prove required properties
 */
export type ExecutionCertStatus =
  | "CONTRACT_WIRED"
  | "EXECUTION_CERTIFIED"
  | "LIVE_PROVIDER_CERTIFIED"
  | "FAILED";

/** Structural acceptance is independent of presentation eligibility. */
export type StructuralAcceptanceStatus =
  | "ACCEPTED"
  | "REJECTED"
  | "NOT_APPLICABLE"
  | "NOT_EVALUATED";

export type PhaseExecutionCertificationRow = {
  readonly service: string;
  readonly phase: string;
  readonly strategy: string;
  readonly modality: string;
  readonly artifactKey: string;
  readonly deliverableKind: string | null;
  readonly structuredContract: string | null;
  readonly compositionContract: string | null;
  readonly verificationRequirements: boolean;
  readonly canonicalArtifactCreated: boolean;
  readonly exactArtifactId: string | null;
  readonly exactArtifactVersion: number | null;
  readonly sessionBound: boolean;
  /** Independent of presentationEligibility — never conflate the two. */
  readonly structuralAcceptance: StructuralAcceptanceStatus;
  readonly presentationEligibility: string | null;
  readonly nextWork: string | null;
  readonly restartSafe: boolean;
  /**
   * Deterministic harness result. LIVE_PROVIDER_CERTIFIED is never emitted
   * by certifyPhaseDeterministic / buildFullExecutionCertificationMatrix.
   */
  readonly result: ExecutionCertStatus;
  readonly failureReason: string | null;
  readonly firstDivergence: string | null;
};

export type ExecutionCertificationSummary = {
  readonly totalPhases: number;
  readonly registryPhaseCount: number;
  readonly byStatus: Record<ExecutionCertStatus, number>;
  readonly certified: number;
  readonly failed: number;
  readonly contractWiredOnly: number;
  /** Always 0 for the deterministic harness. */
  readonly liveProviderCertified: number;
  readonly failures: readonly {
    readonly service: string;
    readonly phase: string;
    readonly firstDivergence: string | null;
    readonly failureReason: string | null;
  }[];
  readonly idealTargetCertified: number;
  readonly harnessMode: "deterministic";
};

const MEDIA_ARTIFACT_TYPES = new Set([
  "image",
  "image_set",
  "video",
  "logo",
  "pack",
]);

function sessionStub(
  sessionId: string,
  serviceId: string,
  phaseId: string,
): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId,
    serviceId,
    organizationId: EXECUTION_CERT_ORG_ID,
    projectId: "proj_exec_cert",
    contractVersion: "2.0.0-m1",
    sessionVersion: 1,
    status: "active",
    brief: "Deterministic execution certification brief",
    phaseIndex: 0,
    phaseId,
    approved: [],
    selected: [],
    masters: {},
    modeOwnership: "ai",
    productMode: "ai",
    createdAt: ts,
    updatedAt: ts,
  };
}

type SessionExactRef = {
  readonly artifactId: string;
  readonly version: number;
  readonly artifactKey: string;
};

function pinForArtifactKey(
  sessionId: string,
  artifactKey: string,
): SessionExactRef | undefined {
  const session = getCdfSession(sessionId);
  if (!session) return undefined;
  const lists = [
    session.approvedArtifacts,
    session.selectedArtifacts,
    session.generatedArtifacts,
  ];
  for (const list of lists) {
    const hit = list?.find((r) => r.artifactKey === artifactKey);
    if (hit) {
      return {
        artifactId: hit.artifactId,
        version: hit.version,
        artifactKey: hit.artifactKey,
      };
    }
  }
  return undefined;
}

/**
 * Modality / artifactType / structuredOutputContract-name / artifactKey fixtures.
 * No serviceId or phaseId branches. Optional session pins supply exact upstream X@V.
 */
export function buildDeterministicFixtureForPhase(
  phase: CdfPhaseDefinition,
  sessionId?: string,
): unknown {
  const modality = phase.generationModality;
  const artifactType = phase.artifact.artifactType;
  const artifactKey = phase.artifact.artifactKey;
  const contractName = phase.artifact.structuredOutputContract?.name?.trim();

  if (modality === "none" || modality === "materialize") {
    return null;
  }

  // ArtifactKey-driven packaging / social structured fixtures (contract keys).
  if (artifactKey === "packaging.dieline") return fixturePackagingDieline();
  if (artifactKey === "packaging.routes") {
    const d = sessionId ? pinForArtifactKey(sessionId, "packaging.dieline") : undefined;
    return fixturePackagingRoutes(d?.artifactId, d?.version);
  }
  if (artifactKey === "packaging.3d-direction") {
    const d = sessionId ? pinForArtifactKey(sessionId, "packaging.dieline") : undefined;
    const r = sessionId ? pinForArtifactKey(sessionId, "packaging.routes") : undefined;
    return fixturePackaging3dDirection({
      dielineArtifactId: d?.artifactId,
      dielineVersion: d?.version,
      routesArtifactId: r?.artifactId,
      routesVersion: r?.version,
    });
  }
  if (artifactKey === "packaging.front-pack") {
    const r = sessionId ? pinForArtifactKey(sessionId, "packaging.routes") : undefined;
    const t = sessionId
      ? pinForArtifactKey(sessionId, "packaging.3d-direction")
      : undefined;
    const d = sessionId ? pinForArtifactKey(sessionId, "packaging.dieline") : undefined;
    return fixturePackagingFrontPack({
      routesArtifactId: r?.artifactId,
      routesVersion: r?.version,
      threeDArtifactId: t?.artifactId,
      threeDVersion: t?.version,
      dielineArtifactId: d?.artifactId,
      dielineVersion: d?.version,
    });
  }
  if (artifactKey === "packaging.complete-pack") {
    const d = sessionId ? pinForArtifactKey(sessionId, "packaging.dieline") : undefined;
    const r = sessionId ? pinForArtifactKey(sessionId, "packaging.routes") : undefined;
    const t = sessionId
      ? pinForArtifactKey(sessionId, "packaging.3d-direction")
      : undefined;
    const f = sessionId
      ? pinForArtifactKey(sessionId, "packaging.front-pack")
      : undefined;
    return fixturePackagingCompletePack({
      dielineArtifactId: d?.artifactId,
      dielineVersion: d?.version,
      routesArtifactId: r?.artifactId,
      routesVersion: r?.version,
      threeDArtifactId: t?.artifactId,
      threeDVersion: t?.version,
      frontArtifactId: f?.artifactId,
      frontVersion: f?.version,
    });
  }
  if (artifactKey === "packaging.views") {
    const c = sessionId
      ? pinForArtifactKey(sessionId, "packaging.complete-pack")
      : undefined;
    return fixturePackagingViews(c?.artifactId, c?.version);
  }
  if (artifactKey === "packaging.sku-adaptations") {
    const c = sessionId
      ? pinForArtifactKey(sessionId, "packaging.complete-pack")
      : undefined;
    const v = sessionId ? pinForArtifactKey(sessionId, "packaging.views") : undefined;
    return fixturePackagingSkuAdaptations({
      completePackArtifactId: c?.artifactId,
      completePackVersion: c?.version,
      viewsArtifactId: v?.artifactId,
      viewsVersion: v?.version,
    });
  }
  if (artifactKey === "social-media.output") {
    const r = sessionId
      ? pinForArtifactKey(sessionId, "social-media.routes")
      : undefined;
    return fixtureSocialMediaOutput(r?.artifactId, r?.version);
  }

  if (contractName) {
    return fixtureForStructuredContractName(contractName, artifactType);
  }

  // Deck artifact type without emission contract (e.g. slide-refinement patches).
  if (artifactType === "deck") {
    return fixturePresentationDeck();
  }

  if (
    modality === "image" ||
    modality === "video" ||
    modality === "hybrid" ||
    MEDIA_ARTIFACT_TYPES.has(artifactType)
  ) {
    return {
      title: `Deterministic ${modality} fixture`,
      content: `cert:${artifactType}`,
      previewAssetRef: { vaultAssetId: EXECUTION_CERT_VAULT_ID },
      ...(modality === "video" || artifactType === "video"
        ? { durationMs: 1000, mimeType: "video/mp4" }
        : {}),
    };
  }

  if (modality === "text") {
    return `Deterministic text fixture for ${phase.artifact.artifactKey}`;
  }

  return {
    title: "Deterministic structured fixture",
    content: `cert:${phase.artifact.artifactKey}`,
  };
}

function fixtureForStructuredContractName(
  name: string,
  artifactType: string,
): unknown {
  switch (name) {
    case "CdfPresentationStoryline":
      return fixturePresentationStoryline();
    case "CdfPresentationSlideContent":
      return fixturePresentationSlideContent();
    case "PresentationRoutes":
      // Deck deliverable uses deck fixture; routes emission uses route cards.
      if (artifactType === "deck") return fixturePresentationDeck();
      return {
        routes: [
          {
            title: "Route A",
            description: "Narrative A",
            deckTitle: "Deck A",
            deckSubtitle: "Sub A",
            slides: [
              {
                title: "S1",
                bullets: ["a", "b"],
                notes: "n",
                layout: "title_hero",
                visualCue: "hero",
              },
              {
                title: "S2",
                bullets: ["c", "d"],
                notes: "n",
                layout: "content_bullets",
                visualCue: "diagram",
              },
              {
                title: "S3",
                bullets: ["e", "f"],
                notes: "n",
                layout: "key_message",
                visualCue: "quote",
              },
              {
                title: "S4",
                bullets: ["g", "h"],
                notes: "n",
                layout: "section_divider",
                visualCue: "break",
              },
              {
                title: "S5",
                bullets: ["i", "j"],
                notes: "n",
                layout: "content_bullets",
                visualCue: "chart",
              },
              {
                title: "S6",
                bullets: ["k", "l"],
                notes: "n",
                layout: "closing",
                visualCue: "ask",
              },
            ],
          },
          {
            title: "Route B",
            description: "Narrative B",
            deckTitle: "Deck B",
            deckSubtitle: "Sub B",
            slides: [
              {
                title: "S1",
                bullets: ["a", "b"],
                notes: "n",
                layout: "title_hero",
                visualCue: "hero",
              },
              {
                title: "S2",
                bullets: ["c", "d"],
                notes: "n",
                layout: "content_bullets",
                visualCue: "diagram",
              },
              {
                title: "S3",
                bullets: ["e", "f"],
                notes: "n",
                layout: "key_message",
                visualCue: "quote",
              },
              {
                title: "S4",
                bullets: ["g", "h"],
                notes: "n",
                layout: "section_divider",
                visualCue: "break",
              },
              {
                title: "S5",
                bullets: ["i", "j"],
                notes: "n",
                layout: "content_bullets",
                visualCue: "chart",
              },
              {
                title: "S6",
                bullets: ["k", "l"],
                notes: "n",
                layout: "closing",
                visualCue: "ask",
              },
            ],
          },
          {
            title: "Route C",
            description: "Narrative C",
            deckTitle: "Deck C",
            deckSubtitle: "Sub C",
            slides: [
              {
                title: "S1",
                bullets: ["a", "b"],
                notes: "n",
                layout: "title_hero",
                visualCue: "hero",
              },
              {
                title: "S2",
                bullets: ["c", "d"],
                notes: "n",
                layout: "content_bullets",
                visualCue: "diagram",
              },
              {
                title: "S3",
                bullets: ["e", "f"],
                notes: "n",
                layout: "key_message",
                visualCue: "quote",
              },
              {
                title: "S4",
                bullets: ["g", "h"],
                notes: "n",
                layout: "section_divider",
                visualCue: "break",
              },
              {
                title: "S5",
                bullets: ["i", "j"],
                notes: "n",
                layout: "content_bullets",
                visualCue: "chart",
              },
              {
                title: "S6",
                bullets: ["k", "l"],
                notes: "n",
                layout: "closing",
                visualCue: "ask",
              },
            ],
          },
        ],
      };
    case "EmailPlan":
      return {
        title: "Deterministic email",
        subject: "Subject line",
        preheader: "Preheader",
        html: "<p>Hello</p>",
        textFallback: "Hello",
      };
    case "CdfSocialMediaRoutes":
      return fixtureSocialMediaRoutes();
    case "CdfPackagingRoutes":
      return fixturePackagingRoutes();
    case "CdfCreativeDirections":
      return {
        routes: [
          {
            routeId: "route_01",
            name: "Direction One",
            creativeIdea: "Idea one",
            visualTreatment: "Treatment one",
            headlineAngle: "Angle one",
            rationale: "Rationale one",
          },
          {
            routeId: "route_02",
            name: "Direction Two",
            creativeIdea: "Idea two",
            visualTreatment: "Treatment two",
            headlineAngle: "Angle two",
            rationale: "Rationale two",
          },
          {
            routeId: "route_03",
            name: "Direction Three",
            creativeIdea: "Idea three",
            visualTreatment: "Treatment three",
            headlineAngle: "Angle three",
            rationale: "Rationale three",
          },
        ],
      };
    case "CdfStructuredApprovalDoc":
      return {
        schemaId: CDF_STRUCTURED_APPROVAL_DOC_SCHEMA_ID,
        title: "Deterministic approval doc",
        summary: "Certification fixture summary",
        sections: [
          {
            id: "sec_1",
            heading: "Section 1",
            body: "Body 1",
            order: 0,
          },
        ],
      };
    case "CdfWebsiteSitemap":
      return {
        type: "sitemap",
        deliverable: "corporate-website-sitemap",
        identityMark: "Wordmark in header",
        globalNavigation: [
          { label: "Home", path: "/" },
          { label: "About", path: "/about" },
          { label: "Services", path: "/services" },
        ],
        siteHierarchy: [
          {
            id: "home",
            label: "Home",
            path: "/",
            children: [{ id: "about", label: "About", path: "/about" }],
          },
        ],
        pageCount: 5,
        globalElements: "Header, footer, cookie banner",
        transitionAndMotionSystem: "Subtle fades",
        responsiveRules: "Mobile-first collapse",
        linkIntegrity: "All nav links resolve",
        openItemsForApproval: ["Confirm pricing page"],
      };
    case "CdfWebsitePageStructure":
      return {
        type: "page_structure",
        deliverable: "website-page-structure",
        title: "Deterministic page structure",
        summary: "Home and About section structures",
        pages: [
          {
            id: "home",
            label: "Home",
            path: "/",
            purpose: "Primary landing",
            sections: [
              {
                id: "home_hero",
                heading: "Hero",
                purpose: "Value proposition",
                order: 0,
                contentBlocks: [
                  {
                    id: "home_hero_cta",
                    kind: "cta",
                    summary: "Primary CTA",
                    order: 0,
                  },
                ],
              },
              {
                id: "home_features",
                heading: "Features",
                purpose: "Capability overview",
                order: 1,
              },
            ],
          },
          {
            id: "about",
            label: "About",
            path: "/about",
            sections: [
              {
                id: "about_intro",
                heading: "Introduction",
                order: 0,
              },
            ],
          },
        ],
        pageCount: 2,
        openItemsForApproval: ["Confirm feature count on Home"],
      };
    case "CdfWebsiteWireframe":
      return {
        schemaId: "unagency.cdf.website_wireframe.v1",
        type: "website_wireframe",
        deliverable: "website-wireframe",
        title: "Deterministic wireframe",
        summary: "Home layout blocks for UI handoff",
        pages: [
          {
            id: "home",
            label: "Home",
            path: "/",
            blocks: [
              {
                id: "home_header",
                region: "header",
                purpose: "Sticky identity + primary nav",
              },
              {
                id: "home_hero",
                region: "hero",
                purpose: "Value proposition + primary CTA",
                hierarchy: "primary",
                placement: "full-bleed top",
              },
              {
                id: "home_footer",
                region: "footer",
                purpose: "Secondary links + legal",
              },
            ],
          },
        ],
        openItemsForApproval: ["Confirm hero CTA weight"],
      };
    default:
      return {
        title: `Deterministic ${name}`,
        content: `contract:${name}`,
      };
  }
}

/**
 * Resolve exact X@V pin from session.generatedArtifacts and Artifact Engine.
 * Never resolves "latest" — exact artifactId + version only.
 */
export function resolveExactGeneratedArtifactPin(input: {
  readonly sessionId: string;
  readonly artifactId: string;
  readonly version: number;
  readonly artifactKey?: string;
  readonly organizationId?: string;
  readonly projectId?: string;
}):
  | {
      readonly ok: true;
      readonly pin: CdfSessionArtifactRef;
      readonly restartSafe: true;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly restartSafe: false;
    } {
  const session = getCdfSession(input.sessionId);
  if (!session) {
    return { ok: false, reason: "session_missing", restartSafe: false };
  }
  const pin = (session.generatedArtifacts ?? []).find((r) => {
    if (r.artifactId !== input.artifactId || r.version !== input.version) {
      return false;
    }
    if (input.artifactKey && r.artifactKey !== input.artifactKey) return false;
    return true;
  });
  if (!pin) {
    return { ok: false, reason: "pin_missing", restartSafe: false };
  }
  try {
    getArtifactVersion(input.artifactId, input.version, {
      organizationId: input.organizationId ?? session.organizationId,
      projectId: input.projectId ?? session.projectId,
    });
  } catch {
    return { ok: false, reason: "artifact_version_missing", restartSafe: false };
  }
  return { ok: true, pin, restartSafe: true };
}

function mapIngestDivergence(kind: GenericCanonicalIngestKind | string): string {
  switch (kind) {
    case "accepted":
      return "none";
    case "skipped_not_applicable":
      return "strategy";
    case "adapter_unavailable":
      return "adapter";
    case "opt_in_disabled":
      return "opt_in";
    case "validation_failed":
      return "validation";
    case "session_bind_failed":
      return "bind";
    case "final_no_artifact":
      return "final";
    case "ingest_failed":
      return "ingest";
    default:
      return String(kind || "unknown");
  }
}

/**
 * Project presentation eligibility independently of structural acceptance.
 * Structural REJECTED visual fixtures must never project as AVAILABLE.
 */
export function projectPresentationEligibility(input: {
  readonly accepted: boolean;
  readonly modality: string;
  readonly hasVaultPreview: boolean;
  readonly structuralAcceptance?: StructuralAcceptanceStatus;
}): string | null {
  if (
    input.structuralAcceptance === "REJECTED" ||
    (!input.accepted && input.structuralAcceptance !== "ACCEPTED")
  ) {
    if (
      input.modality === "image" ||
      input.modality === "video" ||
      input.modality === "hybrid"
    ) {
      return "DIAGNOSTIC_PREVIEW_AVAILABLE";
    }
    return null;
  }
  if (!input.accepted && input.structuralAcceptance !== "ACCEPTED") {
    return null;
  }
  if (
    input.modality === "text" ||
    input.modality === "structured" ||
    input.modality === "none" ||
    input.modality === "materialize"
  ) {
    return "AVAILABLE";
  }
  if (
    (input.modality === "image" ||
      input.modality === "video" ||
      input.modality === "hybrid") &&
    input.hasVaultPreview &&
    input.structuralAcceptance !== "REJECTED"
  ) {
    return "AVAILABLE";
  }
  return "DIAGNOSTIC_PREVIEW_AVAILABLE";
}

/**
 * Negative fixture proof: structural rejection ≠ AVAILABLE; raw art_* ≠ canonical.
 */
export function certifyNegativeEligibilityFixtures(): {
  readonly structurallyRejectedVisualIsNotAvailable: boolean;
  readonly rawArtIsNotCanonical: boolean;
  readonly structuralAcceptance: StructuralAcceptanceStatus;
  readonly presentationEligibility: string;
  readonly rawProviderArtifactId: string;
  readonly canonicalArtifactId: string | null;
} {
  const structuralAcceptance: StructuralAcceptanceStatus = "REJECTED";
  const presentationEligibility = projectPresentationEligibility({
    accepted: false,
    modality: "image",
    hasVaultPreview: true,
    structuralAcceptance,
  });
  const rawProviderArtifactId = "art_provider_raw_fixture_001";
  const isCanonical = rawProviderArtifactId.startsWith("cdfart_");
  return {
    structurallyRejectedVisualIsNotAvailable:
      presentationEligibility !== "AVAILABLE" &&
      presentationEligibility === "DIAGNOSTIC_PREVIEW_AVAILABLE",
    rawArtIsNotCanonical: !isCanonical,
    structuralAcceptance,
    presentationEligibility: presentationEligibility ?? "null",
    rawProviderArtifactId,
    canonicalArtifactId: null,
  };
}

function failRow(
  base: Omit<
    PhaseExecutionCertificationRow,
    "result" | "failureReason" | "firstDivergence" | "restartSafe"
  > &
    Partial<
      Pick<
        PhaseExecutionCertificationRow,
        | "canonicalArtifactCreated"
        | "exactArtifactId"
        | "exactArtifactVersion"
        | "sessionBound"
        | "structuralAcceptance"
        | "presentationEligibility"
        | "nextWork"
        | "restartSafe"
      >
    >,
  divergence: string,
  reason: string,
): PhaseExecutionCertificationRow {
  return {
    ...base,
    canonicalArtifactCreated: base.canonicalArtifactCreated ?? false,
    exactArtifactId: base.exactArtifactId ?? null,
    exactArtifactVersion: base.exactArtifactVersion ?? null,
    sessionBound: base.sessionBound ?? false,
    structuralAcceptance: base.structuralAcceptance ?? "NOT_EVALUATED",
    presentationEligibility: base.presentationEligibility ?? null,
    nextWork: base.nextWork ?? null,
    restartSafe: base.restartSafe ?? false,
    result: "FAILED",
    failureReason: reason,
    firstDivergence: divergence,
  };
}

function promotePinSelectedApproved(input: {
  sessionId: string;
  phaseId: string;
  artifactId: string;
  version: number;
  artifactKey: string;
}): void {
  const session = getCdfSession(input.sessionId);
  if (!session) return;

  // Prefer session-ref upsert without invalid lifecycle transitions.
  // Deep overlays require selected/approved pins; engine status may already
  // be approved from a prior promote in the same service graph.
  const alreadySelected = (session.selectedArtifacts ?? []).some(
    (r) =>
      r.artifactId === input.artifactId &&
      r.version === input.version &&
      r.artifactKey === input.artifactKey,
  );
  const alreadyApproved = (session.approvedArtifacts ?? []).some(
    (r) =>
      r.artifactId === input.artifactId &&
      r.version === input.version &&
      r.artifactKey === input.artifactKey,
  );

  let next = session;
  if (!alreadySelected) {
    try {
      next = applyArtifactEngineOnSelect({
        session: next,
        phaseId: input.phaseId,
        artifactId: input.artifactId,
        artifactVersion: input.version,
        artifactKey: input.artifactKey,
        organizationId: EXECUTION_CERT_ORG_ID,
        projectId: "proj_exec_cert",
      });
    } catch {
      // Lifecycle may already be past selected — still pin on session.
      next = {
        ...next,
        selectedArtifacts: [
          ...(next.selectedArtifacts ?? []).filter(
            (r) => r.artifactKey !== input.artifactKey,
          ),
          {
            artifactId: input.artifactId,
            version: input.version,
            phaseId: input.phaseId,
            artifactKey: input.artifactKey,
            role: "selected",
          },
        ],
      };
    }
  }
  if (!alreadyApproved) {
    try {
      next = applyArtifactEngineOnApprove({
        session: next,
        phaseId: input.phaseId,
        artifactId: input.artifactId,
        artifactVersion: input.version,
        artifactKey: input.artifactKey,
        organizationId: EXECUTION_CERT_ORG_ID,
        projectId: "proj_exec_cert",
      });
    } catch {
      next = {
        ...next,
        approvedArtifacts: [
          ...(next.approvedArtifacts ?? []).filter(
            (r) => r.artifactKey !== input.artifactKey,
          ),
          {
            artifactId: input.artifactId,
            version: input.version,
            phaseId: input.phaseId,
            artifactKey: input.artifactKey,
            role: "approved",
          },
        ],
      };
    }
  }
  saveCdfSession(next);
}

/**
 * Seed a non-generation phase that still declares an ArtifactVersion (e.g. select
 * gates that materialize design-system). Only artifactKeys with known fixtures.
 */
function seedNonGenerationArtifact(input: {
  sessionId: string;
  serviceId: string;
  phase: CdfPhaseDefinition;
}): SessionExactRef | null {
  const key = input.phase.artifact.artifactKey;
  const existing = pinForArtifactKey(input.sessionId, key);
  if (existing) return existing;

  // Only seed when a deterministic fixture exists for this artifactKey.
  // Generic invent-payload would fail schema validation.
  let data: Record<string, unknown> | null = null;
  if (key === "presentation.design-system") {
    data = fixturePresentationDesignSystem() as unknown as Record<string, unknown>;
  } else if (key === "social-media.platform") {
    data = fixtureSocialMediaPlatform() as unknown as Record<string, unknown>;
  } else if (key === "social-media.size-reference") {
    data = fixtureSocialMediaSizeReference() as unknown as Record<
      string,
      unknown
    >;
  } else if (key === "packaging.dieline") {
    data = fixturePackagingDieline() as unknown as Record<string, unknown>;
  }
  if (!data) return null;
  const { artifact, version } = createArtifact({
    artifactKey: key,
    artifactType: input.phase.artifact.artifactType,
    organizationId: EXECUTION_CERT_ORG_ID,
    projectId: "proj_exec_cert",
    sessionId: input.sessionId,
    serviceId: input.serviceId,
    phaseId: input.phase.phaseId,
    data,
    schemaVersion: "1",
  });

  promotePinSelectedApproved({
    sessionId: input.sessionId,
    phaseId: input.phase.phaseId,
    artifactId: artifact.artifactId,
    version: version.version,
    artifactKey: key,
  });

  const session = getCdfSession(input.sessionId);
  if (session) {
    const generated = [...(session.generatedArtifacts ?? [])];
    if (
      !generated.some(
        (r) =>
          r.artifactId === artifact.artifactId && r.version === version.version,
      )
    ) {
      generated.push({
        artifactId: artifact.artifactId,
        version: version.version,
        phaseId: input.phase.phaseId,
        artifactKey: key,
        role: "generated",
      });
      saveCdfSession({ ...session, generatedArtifacts: generated });
    }
  }

  return {
    artifactId: artifact.artifactId,
    version: version.version,
    artifactKey: key,
  };
}

/**
 * Ensure all declared upstream dependency ArtifactVersions exist on the session
 * as exact selected/approved pins — generic dependency walk, no service branches.
 */
function seedUpstreamDependencies(input: {
  sessionId: string;
  serviceId: string;
  phase: CdfPhaseDefinition;
  seeded: Set<string>;
}): void {
  const svc = resolveCdfCanonicalService(input.serviceId);
  if (!svc) return;

  for (const dep of input.phase.dependencies ?? []) {
    const depPhaseId = dep.phaseId?.trim();
    if (!depPhaseId) continue;
    const seedKey = `${input.serviceId}::${depPhaseId}`;
    if (input.seeded.has(seedKey)) continue;
    input.seeded.add(seedKey);

    const depPhase = svc.phases.find((p) => p.phaseId === depPhaseId);
    if (!depPhase) continue;

    // Recurse first so dep's own upstreams exist.
    seedUpstreamDependencies({
      sessionId: input.sessionId,
      serviceId: input.serviceId,
      phase: depPhase,
      seeded: input.seeded,
    });

    const depKey = dep.artifactKey ?? depPhase.artifact.artifactKey;
    if (pinForArtifactKey(input.sessionId, depKey)) {
      // Already present — still promote selected/approved for deep overlays.
      const pin = pinForArtifactKey(input.sessionId, depKey)!;
      promotePinSelectedApproved({
        sessionId: input.sessionId,
        phaseId: depPhaseId,
        artifactId: pin.artifactId,
        version: pin.version,
        artifactKey: pin.artifactKey,
      });
      continue;
    }

    const modality = depPhase.generationModality;
    if (modality === "none" || modality === "materialize") {
      seedNonGenerationArtifact({
        sessionId: input.sessionId,
        serviceId: input.serviceId,
        phase: depPhase,
      });
      continue;
    }

    // Generation upstream — ingest into shared session then promote.
    const fixture = buildDeterministicFixtureForPhase(depPhase, input.sessionId);
    const rawOutput =
      typeof fixture === "string"
        ? { title: "Deterministic upstream text", content: fixture }
        : (fixture ?? {});
    const hasVault =
      typeof rawOutput === "object" &&
      rawOutput != null &&
      (rawOutput as { previewAssetRef?: { vaultAssetId?: string } })
        .previewAssetRef?.vaultAssetId === EXECUTION_CERT_VAULT_ID;

    const ingested = tryIngestCanonicalCdfCompletion({
      metadata: {
        cdfSessionId: input.sessionId,
        cdfPhaseId: depPhaseId,
        cdfServiceId: input.serviceId,
        cdfExecutionStrategy: "canonical",
      },
      rawOutput,
      executionId: `exec_cert_up_${input.serviceId}_${depPhaseId}`,
      organizationId: EXECUTION_CERT_ORG_ID,
      projectId: "proj_exec_cert",
      vaultAssetIds: hasVault ? [EXECUTION_CERT_VAULT_ID] : undefined,
      forceOptIn: true,
    });

    if (ingested?.kind === "accepted" && ingested.attach) {
      bindGenericCanonicalAttach({
        sessionId: input.sessionId,
        phaseId: depPhaseId,
        attach: ingested.attach,
        organizationId: EXECUTION_CERT_ORG_ID,
        projectId: "proj_exec_cert",
        generationExecutionId: `exec_cert_up_${input.serviceId}_${depPhaseId}`,
      });
      const artifactId = String(ingested.attach.cdfArtifactId ?? "").trim();
      const artifactKey = String(ingested.attach.cdfArtifactKey ?? "").trim();
      const version = Number(ingested.attach.cdfArtifactVersion);
      if (artifactId.startsWith("cdfart_") && artifactKey && version >= 1) {
        promotePinSelectedApproved({
          sessionId: input.sessionId,
          phaseId: depPhaseId,
          artifactId,
          version,
          artifactKey,
        });
      }
    } else if (
      depPhase.artifact.artifactKey === "presentation.design-system" ||
      depPhase.artifact.artifactKey === "social-media.platform" ||
      depPhase.artifact.artifactKey === "social-media.size-reference" ||
      depPhase.artifact.artifactKey === "packaging.dieline"
    ) {
      seedNonGenerationArtifact({
        sessionId: input.sessionId,
        serviceId: input.serviceId,
        phase: depPhase,
      });
    }
  }
}

export function certifyPhaseDeterministic(
  serviceId: string,
  phaseId: string,
  options?: {
    readonly sessionId?: string;
    readonly seeded?: Set<string>;
  },
): PhaseExecutionCertificationRow {
  const svc = resolveCdfCanonicalService(serviceId);
  const phase = svc?.phases.find((p) => p.phaseId === phaseId);

  const emptyBase = {
    service: serviceId,
    phase: phaseId,
    strategy: phase?.executionStrategy ?? "unknown",
    modality: phase?.generationModality ?? "unknown",
    artifactKey: phase?.artifact.artifactKey ?? "",
    deliverableKind: phase?.deliverableKind ?? null,
    structuredContract:
      phase?.artifact.structuredOutputContract?.name ?? null,
    compositionContract: null as string | null,
    verificationRequirements: false,
    canonicalArtifactCreated: false,
    exactArtifactId: null as string | null,
    exactArtifactVersion: null as number | null,
    sessionBound: false,
    structuralAcceptance: "NOT_APPLICABLE" as StructuralAcceptanceStatus,
    presentationEligibility: null as string | null,
    nextWork: null as string | null,
    restartSafe: false,
  };

  const contract = resolveCdfPhaseExecutionContract({
    serviceId,
    phaseId,
    phase: phase ?? null,
  });

  if (!contract || !phase || !svc) {
    return failRow(emptyBase, "registry", "resolveCdfPhaseExecutionContract missing");
  }

  const composition =
    contract.deliverableKind != null
      ? resolveDeliverableCompositionContract(contract.deliverableKind)
      : contract.deliverableComposition ?? null;
  const vreqs = deriveVisualVerificationRequirements(composition);
  const next = nextWorkForPhase(phase);

  const base = {
    ...emptyBase,
    strategy: contract.executionStrategy,
    modality: contract.generationModality,
    artifactKey: contract.artifactKey,
    deliverableKind: contract.deliverableKind ?? null,
    structuredContract: contract.structuredOutputContract?.name ?? null,
    compositionContract: composition?.kind ?? null,
    verificationRequirements: vreqs != null && vreqs.criteria.length > 0,
    nextWork: next.kind,
  };

  if (!next || typeof next.kind !== "string") {
    return failRow(
      { ...base },
      "nextWork",
      "nextWorkForPhase missing or invalid",
    );
  }

  const strategy = contract.executionStrategy;
  const modality = contract.generationModality;

  if (
    strategy === "none" ||
    modality === "none" ||
    modality === "materialize"
  ) {
    // NONE / materialize: no generation expected; ArtifactVersion optional seed only.
    if (options?.sessionId && phase.artifact.artifactKey) {
      seedNonGenerationArtifact({
        sessionId: options.sessionId,
        serviceId,
        phase,
      });
    }
    return {
      ...base,
      result: "EXECUTION_CERTIFIED",
      failureReason: null,
      firstDivergence: null,
      restartSafe: true,
      structuralAcceptance: "NOT_APPLICABLE",
      presentationEligibility: projectPresentationEligibility({
        accepted: true,
        modality,
        hasVaultPreview: false,
        structuralAcceptance: "NOT_APPLICABLE",
      }),
      canonicalArtifactCreated: false,
    };
  }

  const sessionId =
    options?.sessionId ??
    `cdf_exec_cert_${serviceId}_${phaseId}_${Date.now().toString(36)}`;
  if (!getCdfSession(sessionId)) {
    saveCdfSession(sessionStub(sessionId, serviceId, phaseId));
  } else {
    const cur = getCdfSession(sessionId)!;
    saveCdfSession({ ...cur, phaseId, serviceId });
  }

  const seeded = options?.seeded ?? new Set<string>();
  seedUpstreamDependencies({
    sessionId,
    serviceId,
    phase,
    seeded,
  });

  const fixture = buildDeterministicFixtureForPhase(phase, sessionId);
  const rawOutput =
    typeof fixture === "string"
      ? { title: "Deterministic text fixture", content: fixture }
      : (fixture ?? {});
  const hasVault =
    typeof rawOutput === "object" &&
    rawOutput != null &&
    (rawOutput as { previewAssetRef?: { vaultAssetId?: string } })
      .previewAssetRef?.vaultAssetId === EXECUTION_CERT_VAULT_ID;

  const ingested = tryIngestCanonicalCdfCompletion({
    metadata: {
      cdfSessionId: sessionId,
      cdfPhaseId: phaseId,
      cdfServiceId: serviceId,
      cdfExecutionStrategy: "canonical",
    },
    rawOutput,
    executionId: `exec_cert_${serviceId}_${phaseId}`,
    organizationId: EXECUTION_CERT_ORG_ID,
    projectId: "proj_exec_cert",
    vaultAssetIds: hasVault ? [EXECUTION_CERT_VAULT_ID] : undefined,
    forceOptIn: true,
  });

  if (!ingested) {
    return failRow(
      { ...base },
      "ingest",
      "tryIngestCanonicalCdfCompletion returned null",
    );
  }

  if (ingested.kind !== "accepted") {
    return failRow(
      { ...base },
      mapIngestDivergence(ingested.kind),
      ingested.message ?? ingested.fallbackReason ?? ingested.kind,
    );
  }

  const artifactId = String(ingested.attach?.cdfArtifactId ?? "").trim();
  const artifactKey = String(ingested.attach?.cdfArtifactKey ?? "").trim();
  const version = Number(ingested.attach?.cdfArtifactVersion);

  if (
    !artifactId.startsWith("cdfart_") ||
    !artifactKey ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return failRow(
      { ...base, canonicalArtifactCreated: Boolean(artifactId) },
      "attach",
      "Accepted ingest missing exact artifact identity",
    );
  }

  let loaded = getCdfSession(sessionId);
  let bound = (loaded?.generatedArtifacts ?? []).some(
    (a) =>
      a.artifactKey === contract.artifactKey &&
      a.artifactId === artifactId &&
      a.version === version,
  );
  if (!bound && ingested.attach) {
    const bindResult = bindGenericCanonicalAttach({
      sessionId,
      phaseId,
      attach: ingested.attach,
      organizationId: EXECUTION_CERT_ORG_ID,
      projectId: "proj_exec_cert",
      generationExecutionId: `exec_cert_${serviceId}_${phaseId}`,
    });
    if (!bindResult.ok) {
      return failRow(
        {
          ...base,
          canonicalArtifactCreated: true,
          exactArtifactId: artifactId,
          exactArtifactVersion: version,
          sessionBound: false,
        },
        "bind",
        bindResult.message ?? bindResult.reason,
      );
    }
    loaded = getCdfSession(sessionId);
    bound = (loaded?.generatedArtifacts ?? []).some(
      (a) =>
        a.artifactKey === contract.artifactKey &&
        a.artifactId === artifactId &&
        a.version === version,
    );
  }

  if (!bound) {
    return failRow(
      {
        ...base,
        canonicalArtifactCreated: true,
        exactArtifactId: artifactId,
        exactArtifactVersion: version,
        sessionBound: false,
      },
      "bind",
      `generatedArtifacts missing exact pin for ${contract.artifactKey}`,
    );
  }

  // Promote current pin so downstream continuity certs see selected/approved.
  promotePinSelectedApproved({
    sessionId,
    phaseId,
    artifactId,
    version,
    artifactKey: contract.artifactKey,
  });

  const pinCheck = resolveExactGeneratedArtifactPin({
    sessionId,
    artifactId,
    version,
    artifactKey: contract.artifactKey,
    organizationId: EXECUTION_CERT_ORG_ID,
    projectId: "proj_exec_cert",
  });

  const eligibility = projectPresentationEligibility({
    accepted: true,
    modality,
    hasVaultPreview: hasVault,
    structuralAcceptance: "ACCEPTED",
  });

  // Modality integrity — harness must prove modality-relevant properties
  // without exceeding the production contract.
  if (
    modality === "structured" &&
    contract.structuredEmission === "required" &&
    !contract.structuredOutputContract
  ) {
    return failRow(
      {
        ...base,
        canonicalArtifactCreated: true,
        exactArtifactId: artifactId,
        exactArtifactVersion: version,
        sessionBound: true,
        structuralAcceptance: "ACCEPTED",
        presentationEligibility: eligibility,
      },
      "structured_contract",
      "STRUCTURED modality with structuredEmission=required missing structuredOutputContract",
    );
  }
  if (
    (modality === "image" || modality === "video" || modality === "hybrid") &&
    !composition &&
    contract.deliverableKind
  ) {
    return failRow(
      {
        ...base,
        canonicalArtifactCreated: true,
        exactArtifactId: artifactId,
        exactArtifactVersion: version,
        sessionBound: true,
        structuralAcceptance: "ACCEPTED",
        presentationEligibility: eligibility,
      },
      "composition",
      `${modality} modality with deliverableKind missing composition contract`,
    );
  }
  if (artifactId.startsWith("art_")) {
    return failRow(
      {
        ...base,
        canonicalArtifactCreated: false,
        exactArtifactId: artifactId,
        exactArtifactVersion: version,
        sessionBound: bound,
        structuralAcceptance: "REJECTED",
        presentationEligibility: "DIAGNOSTIC_PREVIEW_AVAILABLE",
      },
      "canonical_identity",
      "Raw art_* must never be recorded as canonical ArtifactVersion",
    );
  }

  if (!pinCheck.ok) {
    return failRow(
      {
        ...base,
        canonicalArtifactCreated: true,
        exactArtifactId: artifactId,
        exactArtifactVersion: version,
        sessionBound: true,
        structuralAcceptance: "ACCEPTED",
        presentationEligibility: eligibility,
        restartSafe: false,
      },
      "restart",
      `Exact pin restart check failed: ${pinCheck.reason}`,
    );
  }

  return {
    ...base,
    canonicalArtifactCreated: true,
    exactArtifactId: artifactId,
    exactArtifactVersion: version,
    sessionBound: true,
    structuralAcceptance: "ACCEPTED",
    presentationEligibility: eligibility,
    restartSafe: true,
    result: "EXECUTION_CERTIFIED",
    failureReason: null,
    firstDivergence: null,
  };
}

export function buildFullExecutionCertificationMatrix(): readonly PhaseExecutionCertificationRow[] {
  const rows: PhaseExecutionCertificationRow[] = [];
  for (const serviceId of listCdfCanonicalServiceIds()) {
    const svc = resolveCdfCanonicalService(serviceId);
    if (!svc) continue;
    // One durable session per service graph — proves exact downstream continuity.
    const sessionId = `cdf_exec_cert_svc_${serviceId}_${Date.now().toString(36)}`;
    saveCdfSession(sessionStub(sessionId, serviceId, svc.phases[0]?.phaseId ?? "unknown"));
    const seeded = new Set<string>();
    const ordered = [...svc.phases].sort(
      (a, b) => (a.phaseOrder ?? 0) - (b.phaseOrder ?? 0),
    );
    for (const phase of ordered) {
      rows.push(
        certifyPhaseDeterministic(serviceId, phase.phaseId, {
          sessionId,
          seeded,
        }),
      );
    }
  }
  return rows;
}

export function summarizeExecutionCertificationMatrix(
  rows: readonly PhaseExecutionCertificationRow[] = buildFullExecutionCertificationMatrix(),
): ExecutionCertificationSummary {
  const byStatus: Record<ExecutionCertStatus, number> = {
    CONTRACT_WIRED: 0,
    EXECUTION_CERTIFIED: 0,
    LIVE_PROVIDER_CERTIFIED: 0,
    FAILED: 0,
  };
  const failures: ExecutionCertificationSummary["failures"][number][] = [];
  for (const r of rows) {
    byStatus[r.result] += 1;
    if (r.result === "FAILED") {
      failures.push({
        service: r.service,
        phase: r.phase,
        firstDivergence: r.firstDivergence,
        failureReason: r.failureReason,
      });
    }
  }
  return {
    totalPhases: rows.length,
    registryPhaseCount: countCdfCanonicalPhases(),
    byStatus,
    certified: byStatus.EXECUTION_CERTIFIED,
    failed: byStatus.FAILED,
    contractWiredOnly: byStatus.CONTRACT_WIRED,
    liveProviderCertified: byStatus.LIVE_PROVIDER_CERTIFIED,
    failures,
    idealTargetCertified: countCdfCanonicalPhases(),
    harnessMode: "deterministic",
  };
}

export function runFullExecutionCertification(): {
  readonly rows: readonly PhaseExecutionCertificationRow[];
  readonly summary: ExecutionCertificationSummary;
} {
  const rows = buildFullExecutionCertificationMatrix();
  return { rows, summary: summarizeExecutionCertificationMatrix(rows) };
}

/** JSON-serializable summary shape for reports / CI artifacts. */
export function executionCertificationSummaryToJson(
  summary: ExecutionCertificationSummary,
): Record<string, unknown> {
  return {
    harnessMode: summary.harnessMode,
    totalPhases: summary.totalPhases,
    registryPhaseCount: summary.registryPhaseCount,
    byStatus: { ...summary.byStatus },
    certified: summary.certified,
    failed: summary.failed,
    contractWiredOnly: summary.contractWiredOnly,
    liveProviderCertified: summary.liveProviderCertified,
    idealTargetCertified: summary.idealTargetCertified,
    note:
      "EXECUTION_CERTIFIED is deterministic plumbing only. LIVE_PROVIDER_CERTIFIED was NOT RUN.",
    failures: summary.failures.map((f) => ({ ...f })),
  };
}
