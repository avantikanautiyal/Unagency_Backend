/**
 * Priority 4.5 — Conversational task intelligence contracts.
 * Advisory resolution layer; OS owns state — providers are not the source of truth.
 */

import type { ServiceFollowUpIntent } from "../service-conversation-types";
import type { CanonicalExecutionSpecification } from "./execution-specification";

export const CONVERSATIONAL_TASK_PLANE_VERSION = "p4.5.1" as const;

/** Canonical conversational actions — semantic, not phrase-mapped. */
export type ConversationalAction =
  | "CONVERSATIONAL_RESPONSE"
  | "CREATE"
  | "MODIFY"
  | "REGENERATE"
  | "VARIATE"
  | "EXTEND"
  | "CONTINUE"
  | "TRANSFORM"
  | "REMOVE"
  | "REPLACE"
  | "REVERT"
  | "COMPARE"
  | "EXPLAIN"
  | "CRITIQUE"
  | "SUMMARIZE"
  | "CLARIFY"
  | "APPROVE"
  | "REJECT"
  | "PLAN"
  | "INFORMATION_REQUEST"
  /** P4.7 — separate / deliver existing child assets without regenerating. */
  | "EXTRACT_ASSETS";

export type RequirementSource =
  | "EXPLICIT_USER"
  | "INFERRED"
  | "SYSTEM"
  | "CONTRACT";

export type RequirementPersistence = "TEMPORARY" | "PERSISTENT";

export type RequirementStatus = "active" | "superseded" | "removed";

export type ConversationalRequirement = {
  readonly id: string;
  readonly key: string;
  readonly value: string;
  readonly source: RequirementSource;
  readonly persistence: RequirementPersistence;
  readonly status: RequirementStatus;
  readonly introducedAt: string;
  readonly introducedMessageId?: string;
  readonly supersededAt?: string;
  readonly supersededById?: string;
};

export type ConversationalDecision = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly messageId?: string;
  readonly at: string;
};

export type TaskAlternative = {
  readonly executionId: string;
  readonly artifactId?: string;
  readonly routeId?: string;
  readonly label?: string;
  readonly createdAt: string;
};

export type ConversationalTaskThread = {
  readonly threadId: string;
  readonly label?: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly objective?: string;
  readonly status: "active" | "paused" | "completed";
  readonly activeExecutionId?: string;
  readonly activeArtifactId?: string;
  readonly parentExecutionId?: string;
  readonly selectedRouteId?: string;
  readonly selectedRouteTitle?: string;
  readonly requirements: readonly ConversationalRequirement[];
  readonly decisions: readonly ConversationalDecision[];
  readonly alternatives: readonly TaskAlternative[];
  readonly unresolvedAmbiguities: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  /** P4.6 — last resolved execution specification for multi-turn merging. */
  readonly lastExecutionSpec?: import("./execution-specification").CanonicalExecutionSpecification;
  /** P4.9.7.1 — pending authoritative logo selection (survives reload). */
  readonly pendingLogoClarification?: {
    readonly candidates: readonly import("./execution-specification").AuthoritativeLogoCandidate[];
    readonly resumePrompt?: string;
  };
};

export type ConversationalTaskIntelligenceState = {
  readonly planeVersion: typeof CONVERSATIONAL_TASK_PLANE_VERSION;
  readonly activeThreadId?: string;
  readonly threads: readonly ConversationalTaskThread[];
  readonly pendingProposal?: {
    readonly action: ConversationalAction;
    readonly summary: string;
    readonly proposedAt: string;
    readonly messageId?: string;
  };
  readonly lastResolutionAt?: string;
};

export type ResolvedRouteAsset = {
  readonly id: string;
  readonly label?: string;
  readonly imageUri?: string;
  readonly artifactId?: string;
};

export type ResolvedReference = {
  readonly kind: "execution" | "artifact" | "route" | "thread" | "version" | "asset" | "assets";
  readonly executionId?: string;
  readonly artifactId?: string;
  readonly routeId?: string;
  readonly routeIndex?: number;
  readonly versionIndex?: number;
  readonly threadId?: string;
  /** P4.7 — child assets resolved from a route (never fabricated). */
  readonly targetAssetIds?: readonly string[];
  readonly targetAssets?: readonly ResolvedRouteAsset[];
  readonly targetAssetIndex?: number;
  readonly confidence: number;
  readonly evidence: readonly string[];
};

export type TurnConfidence = {
  readonly intent: number;
  readonly reference: number;
  readonly requirement: number;
};

export type ConversationalClarification = {
  readonly question: string;
  readonly ambiguities: readonly string[];
  readonly preserveState: true;
  /** P4.9.7.1 — structured clarification kind (default: generic text). */
  readonly kind?: "logo_selection" | "generic";
  /** P4.9.7.1 — authoritative logo candidates when kind=logo_selection. */
  readonly logoCandidates?: readonly LogoClarificationCandidate[];
  /** Original user prompt to resume after logo selection. */
  readonly resumePrompt?: string;
};

export type LogoClarificationCandidate = {
  readonly selectionId: string;
  readonly assetId: string;
  readonly source: "VAULT" | "ATTACHMENT";
  readonly name?: string;
  readonly folder?: string;
  readonly thumbnailUrl?: string;
  readonly mimeType?: string;
};

export type ConversationalTurnObservability = {
  readonly conversationId: string;
  readonly channelId: string;
  readonly messageId?: string;
  readonly threadId?: string;
  readonly resolvedAction: ConversationalAction;
  readonly legacyIntent: ServiceFollowUpIntent;
  readonly requiresExecution: boolean;
  readonly clarificationRequested: boolean;
  readonly referencedExecutionId?: string;
  readonly referencedArtifactId?: string;
  readonly referencedRouteId?: string;
  readonly targetType?: string;
  readonly targetCount?: number;
  readonly resolutionConfidence?: number;
  readonly requirementChangeCount: number;
  readonly contextMessageCount: number;
};

export type ConversationalTurnResolution = {
  readonly planeVersion: typeof CONVERSATIONAL_TASK_PLANE_VERSION;
  readonly action: ConversationalAction;
  readonly legacyIntent: ServiceFollowUpIntent;
  readonly requiresExecution: boolean;
  readonly clarification?: ConversationalClarification;
  readonly reference?: ResolvedReference;
  readonly activeThreadId: string;
  readonly effectiveObjective?: string;
  readonly effectiveRequirements: readonly ConversationalRequirement[];
  readonly effectiveInstruction: string;
  readonly confidence: TurnConfidence;
  readonly rationale: readonly string[];
  readonly observability: ConversationalTurnObservability;
  readonly updatedTaskState: ConversationalTaskIntelligenceState;
  /** P4.6 — resolved canonical execution specification. */
  readonly executionSpec?: CanonicalExecutionSpecification;
};

export type ConversationalTurnInput = {
  readonly conversationId: string;
  readonly channelId: string;
  readonly messageId?: string;
  readonly latestUserMessage: string;
  readonly messages: readonly import("../service-conversation-types").ServiceAiMessageRecord[];
  readonly state: import("../service-conversation-types").ServiceAiConversationState;
  readonly nowIso?: () => string;
  /**
   * Precomputed semantic signals (LLM-primary in production).
   * When omitted, resolver falls back to English heuristics for tests / offline.
   */
  readonly signals?: import("./semantic-signals").SemanticSignals;
  /** When true, treat message as a substantive new brief (from LLM classify). */
  readonly isSubstantiveNewGeneration?: boolean;
  /** P4.9.7 — optional logo discovery inputs (client handoff / tests). */
  readonly logoDiscovery?: {
    readonly vaultCandidates?: readonly import("./execution-specification").AuthoritativeLogoCandidate[];
    readonly attachmentLogoAssetIds?: readonly string[];
    readonly vaultLogoChoice?: string;
  };
};
