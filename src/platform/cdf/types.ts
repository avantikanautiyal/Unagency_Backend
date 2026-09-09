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

export type CdfApprovedPhase = {
  phaseId: string;
  approvedAt: string;
  selectedRouteIndex?: number;
  selectedRouteLabel?: string;
  artifactId?: string;
  executionId?: string;
  note?: string;
};

export type CdfSessionState = {
  sessionId: string;
  serviceId: string;
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  brief?: string;
  /** Index into config.phases; -1 = awaiting brief. */
  phaseIndex: number;
  phaseId: string | null;
  approved: CdfApprovedPhase[];
  masters: {
    routeId?: string;
    routeTitle?: string;
    routeDesc?: string;
    masterArtifactId?: string;
    masterExecutionId?: string;
    brandName?: string;
    brandColors?: string[];
  };
  modeOwnership: CdfModeOwnership;
  productMode: "ai" | "hybrid" | "human";
  createdAt: string;
  updatedAt: string;
};

export type CdfTransitionAction =
  | "start"
  | "submit_brief"
  | "select_route"
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
  /** AI-generated route title when config has no static routes[]. */
  routeTitle?: string;
  routeLabel?: string;
  routeDesc?: string;
  refinePrompt?: string;
  finalAction?: string;
  artifactId?: string;
  executionId?: string;
  /** Snapshot of approved phase body (storyline, sitemap, copy, etc.). */
  note?: string;
  projectId?: string;
  productMode?: "ai" | "hybrid" | "human";
  organizationId?: string;
  workspaceId?: string;
  userId?: string;
};

export type CdfUiHint = {
  progressLabels: string[];
  currentPhaseIndex: number;
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
  /** Side-effect hint for the client (generate routes, image, etc.). */
  nextWork:
    | { kind: "await_brief" }
    | { kind: "show_phase"; phaseId: string }
    | { kind: "generate"; phaseId: string; generator: CdfGeneratorKind }
    | { kind: "refine"; phaseId: string; prompt: string }
    | { kind: "materialize_final"; action: string }
    | { kind: "studio_handoff" }
    | { kind: "none" };
};
