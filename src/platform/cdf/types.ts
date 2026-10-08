/**
 * CDF (Creative Delivery Flow) — stage machine contracts.
 * Source of truth for v1 phase lists: Figma Make Create-all-screens-flow.
 */

export type CdfPhaseType =
  | "routes"
  | "text-approval"
  | "output"
  | "mockup"
  | "multi-output"
  | "final";

/** How this phase is produced by the execution stack. */
export type CdfGeneratorKind =
  | "launch_routes"
  | "text"
  | "image"
  | "video"
  | "structured"
  | "materialize"
  | "none";

export type CdfRouteCard = {
  label: string;
  title: string;
  desc: string;
};

export type CdfFlowPhase = {
  id: string;
  progressLabel: string;
  entryMessage: string;
  type: CdfPhaseType;
  generator: CdfGeneratorKind;
  /** Prior phase ids that must be approved before this phase can run. */
  inherits?: string[];
  routes?: CdfRouteCard[];
  textLines?: string[];
  outputLabel?: string;
  refineExamples?: string[];
  approveLabel?: string;
  finalActions?: string[];
  postApproveMessage?: string;
  /** Card noun for AI choice stages (Territory / Direction / Theme…). */
  choiceNoun?: string;
  /** Selecting a card stays in chat (default for routes). */
  selectionStayInChat?: boolean;
};

export type CdfServiceConfig = {
  /** Stable id used in APIs (e.g. social-media). */
  serviceId: string;
  /** Display name matching Choose Service UI. */
  service: string;
  /** Maps to SERVICE_OUTPUT_MAP service slug when known. */
  outputMapService?: string;
  briefPlaceholder: string;
  briefAck: string;
  phases: CdfFlowPhase[];
  /**
   * After this phase is approved, Hybrid may show Send to Studio.
   * Default product rule: first creative/output approval.
   */
  studioHandoffAfterPhaseId?: string;
};

export type CdfModeOwnership = "ai" | "studio";

/** M1B session lifecycle status (server-authoritative). */
export type CdfSessionStatus =
  | "awaiting_brief"
  | "active"
  | "completed"
  | "handed_off";

export type CdfApprovedPhase = {
  phaseId: string;
  approvedAt: string;
  selectedRouteIndex?: number;
  selectedRouteLabel?: string;
  /** Phase-scoped creative reference — not a vault asset id. */
  artifactId?: string;
  /** Exact Artifact Engine version when artifactId is cdfart_*. */
  artifactVersion?: number;
  /** Direct-stack execution that produced the approved work — not an artifact id. */
  executionId?: string;
  note?: string;
};

/** Selection is distinct from approval (M1B). */
export type CdfSelectedPhase = {
  phaseId: string;
  selectedAt: string;
  selectedRouteIndex?: number;
  selectedRouteLabel?: string;
  /**
   * Stable choice identity within the exact parent ArtifactVersion
   * (e.g. routes[].routeId). Preferred over presentation indexes.
   */
  selectedChoiceId?: string;
  routeTitle?: string;
  routeDesc?: string;
  /** Selected creative reference — not a vault asset id. */
  artifactId?: string;
  /** Exact Artifact Engine version when artifactId is cdfart_*. */
  artifactVersion?: number;
  executionId?: string;
};

/**
 * User-authorized generation continuation — NOT approval, NOT canonical completion.
 * Persists the exact clicked generation (incl. raw art_*) for the next phase.
 * Never promotes raw media to ArtifactVersion / selectedArtifacts / approvedArtifacts.
 */
export type CdfGenerationContinuationSelection = {
  readonly selectionKind: "generation_continuation";
  readonly sourcePhaseId: string;
  readonly sourceArtifactKey?: string;
  readonly selectedAt: string;
  /** Leaf / generation execution that produced the creative. */
  readonly executionId: string;
  /**
   * Visual reference:
   * - AVAILABLE: exact cdfart_* when present
   * - DIAGNOSTIC_PREVIEW_AVAILABLE: raw art_* (inspection/continuation only)
   */
  readonly visualArtifactId: string;
  /** Exact version when visualArtifactId is cdfart_*. */
  readonly visualArtifactVersion?: number;
  /** True when visualArtifactId is raw provider media (art_*), not cdfart_*. */
  readonly isDiagnosticRaw: boolean;
  readonly generationFanoutGroupId?: string;
  readonly generationFanoutTargetId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  /** Presentation eligibility at selection time (observational). */
  readonly presentationEligibilityStatus?: string;
  /** Exact upstream canonical direction X@V (routes choice), when known. */
  readonly upstreamArtifactId?: string;
  readonly upstreamArtifactVersion?: number;
  readonly upstreamChoiceId?: string;
  readonly upstreamRouteIndex?: number;
};

/** Session reference to a canonical artifact version (payload lives in Artifact Engine). */
export type CdfSessionArtifactRef = {
  artifactId: string;
  version: number;
  phaseId: string;
  artifactKey: string;
  /**
   * generated — produced by ingest, not yet user-selected
   * selected — user explicitly selected (≠ approved)
   * approved — user approved exact version
   */
  role: "generated" | "selected" | "approved";
  /**
   * Intentional generation-fanout leaf scope (optional).
   * When present on a generated pin, canonical completion idempotency and
   * generatedArtifacts upsert are scoped to this leaf — not session+phase alone.
   */
  generationFanoutGroupId?: string;
  generationFanoutTargetId?: string;
  /** Execution that produced this generated pin (leaf identity / hydration). */
  generationExecutionId?: string;
  /**
   * routeIndex the caller selected when this ref was materialized via
   * select_route (optional; only set by materializeDerivedOnSelect
   * handlers). Lets a repeat select_route on the same phase tell "same
   * route re-clicked" (true idempotent no-op) apart from "different route
   * chosen" (must re-materialize) without re-deriving the artifact.
   */
  selectionRouteIndex?: number;
};

export type CdfSessionState = {
  sessionId: string;
  serviceId: string;
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  /** Canonical CDF contract version this session was created under. */
  contractVersion: string;
  /**
   * Optimistic concurrency token. Every successful mutation increments by 1.
   * Clients must send expectedVersion matching this value.
   */
  sessionVersion: number;
  status: CdfSessionStatus;
  brief?: string;
  /** Index into config.phases; -1 = awaiting brief. */
  phaseIndex: number;
  phaseId: string | null;
  approved: CdfApprovedPhase[];
  /** Explicit selections (may exist without approval). */
  selected: CdfSelectedPhase[];
  /**
   * User-authorized generation continuations (workflow advance ≠ approval).
   * Latest entry per sourcePhaseId wins. Never treated as canonical pins.
   */
  generationContinuations?: CdfGenerationContinuationSelection[];
  /**
   * M3A — exact-version refs into Artifact Engine (no payloads).
   * Legacy approved[]/selected[] remain for gates/compat.
   */
  approvedArtifacts?: CdfSessionArtifactRef[];
  selectedArtifacts?: CdfSessionArtifactRef[];
  /** M8C — post-ingest generated refs (exact version); not yet selected/approved. */
  generatedArtifacts?: CdfSessionArtifactRef[];
  masters: {
    routeId?: string;
    routeTitle?: string;
    routeDesc?: string;
    masterArtifactId?: string;
    masterExecutionId?: string;
    brandName?: string;
    brandColors?: string[];
    /** Product picker subtype — declarative video (and other) overlays. */
    productSubtype?: string;
    productPlatform?: string;
  };
  /** Last successful request key for idempotent replay. */
  lastRequestKey?: string;
  /** Last RefinePrompt / scope (M1B). */
  lastRefinePrompt?: string;
  lastRefineScope?: string;
  /** M2 Requirement Engine refs — engine owns requirement state. */
  activeBriefId?: string;
  activeBriefVersion?: number;
  modeOwnership: CdfModeOwnership;
  productMode: "ai" | "hybrid" | "human";
  createdAt: string;
  updatedAt: string;
};

export type CdfTransitionAction =
  | "start"
  | "submit_brief"
  | "select_route"
  | "select_generation_for_continuation"
  /**
   * After the user stops a generation that a route selection started, step back
   * to that routes phase so a (different) route can be selected.
   */
  | "reopen_route_selection"
  | "approve"
  | "refine"
  | "final_action"
  | "handoff_studio";

export type CdfTransitionRequest = {
  sessionId?: string;
  serviceId?: string;
  action: CdfTransitionAction;
  brief?: string;
  phaseId?: string;
  routeIndex?: number;
  /**
   * Stable choice identity within the exact parent ArtifactVersion
   * (e.g. routes[].routeId). When present, backend resolves/validates against X@V.
   */
  choiceId?: string;
  /** AI-generated route title when config has no static routes[]. */
  routeTitle?: string;
  routeLabel?: string;
  routeDesc?: string;
  /** User-supplied value for options that require input (size, file, text…). */
  routeInput?: string;
  refinePrompt?: string;
  /** Optional refinement scope (M1B stores intent; targeted refine = M6). */
  refineScope?: string;
  finalAction?: string;
  /** Typed final action id when available (preferred over label matching). */
  finalActionId?: string;
  artifactId?: string;
  /** Exact Artifact Engine version (required when approving/selecting cdfart_*). */
  artifactVersion?: number;
  /** Semantic artifact key when wiring Artifact Engine (e.g. presentation.deck). */
  artifactKey?: string;
  executionId?: string;
  /** Snapshot of approved phase body (storyline, sitemap, copy, etc.). */
  note?: string;
  projectId?: string;
  productMode?: "ai" | "hybrid" | "human";
  organizationId?: string;
  workspaceId?: string;
  userId?: string;
  /** Product picker hints — skip CDF gates already answered. */
  platform?: string;
  format?: string;
  subtype?: string;
  category?: string;
  /**
   * Required for mutations on existing sessions (M1B).
   * Omitted only for start, or legacy clients (compat: treated as current version).
   */
  expectedVersion?: number;
  /** Optional idempotency key for safe retries. */
  requestId?: string;
  /** Client contract version — rejected if incompatible. */
  contractVersion?: string;
  /** M6 / M2B: exact generation context refs (stale check). */
  contextId?: string;
  contextHash?: string;
  /** Generation continuation — exact clicked leaf / visual ref. */
  generationFanoutGroupId?: string;
  generationFanoutTargetId?: string;
  /** Raw or canonical visual artifact for continuation (art_* or cdfart_*). */
  visualArtifactId?: string;
  visualArtifactVersion?: number;
  presentationEligibilityStatus?: string;
  providerId?: string;
  modelId?: string;
};

export type CdfUiHint = {
  progressLabels: string[];
  currentPhaseIndex: number;
  /**
   * Authoritative per-phase progress — never infer completion from index alone.
   * completed ⇒ canonical/legacy completion contract satisfied.
   * incomplete ⇒ phaseIndex advanced past this phase without completion (fail-closed UI).
   */
  phaseProgressStatuses?: Array<
    "upcoming" | "active" | "completed" | "incomplete" | "failed"
  >;
  currentPhase: CdfFlowPhase | null;
  allowedActions: CdfTransitionAction[];
  showSendToStudio: boolean;
  refineExamples: string[];
  finalActions: string[];
};

export type CdfTransitionResult = {
  session: CdfSessionState;
  config: CdfServiceConfig;
  ui: CdfUiHint;
  /** Server-authoritative nextWork (client must not invent phase advancement). */
  nextWork:
    | { kind: "await_brief" }
    | { kind: "show_phase"; phaseId: string }
    | { kind: "generate"; phaseId: string; generator: CdfGeneratorKind }
    | { kind: "refine"; phaseId: string; prompt: string }
    | {
        kind: "targeted_refine";
        phaseId: string;
        prompt: string;
        refinementId: string;
        artifactId: string;
        sourceVersion: number;
        newVersion?: number;
        status: string;
        clarificationReason?: string;
        clarificationCandidates?: string[];
        changes?: Array<{
          property: string;
          path: string;
          from: unknown;
          to: unknown;
        }>;
        validationStatus?: string;
        target?: {
          slideId?: string;
          elementId?: string;
          path: string;
          entityId?: string;
          entityKind?: string;
          fieldPath?: string;
        };
      }
    | { kind: "materialize_final"; action: string }
    | { kind: "studio_handoff" }
    | { kind: "none" };
  /** Echo of session.sessionVersion after the transition. */
  version: number;
  /** True when an identical requestId was replayed without re-mutating. */
  idempotentReplay?: boolean;
};
