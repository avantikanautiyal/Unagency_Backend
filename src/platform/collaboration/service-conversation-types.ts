/**
 * Service AI conversation — types for persistent, context-aware service chat.
 * Uses Collaboration OS as the single conversation store (no duplicate store).
 */

import type { ConversationalTaskIntelligenceState } from "./conversational-task-intelligence/conversational-task-contract";
import type { ConversationalAction, ConversationalRequirement } from "./conversational-task-intelligence/conversational-task-contract";
import type { CanonicalExecutionSpecification } from "./conversational-task-intelligence/execution-specification";

export type ServiceFollowUpIntent =
  | "new_generation"
  | "refinement"
  | "modification"
  | "continuation"
  | "export"
  | "clarification";

/** Active deliverable / working state scoped to one service conversation. */
export type ServiceAiConversationState = {
  service?: string;
  subtype?: string;
  platform?: string;
  format?: string;
  category?: string;
  brandId?: string;
  productPath?: string;
  /** Latest accepted/completed execution in this conversation. */
  activeExecutionId?: string;
  activeArtifactId?: string;
  selectedRouteId?: string;
  selectedRouteTitle?: string;
  /** Execution currently in-flight (for reload resume). */
  inProgressExecutionId?: string;
  /** Priority 4.5 — durable conversational task intelligence state. */
  taskIntelligence?: ConversationalTaskIntelligenceState;
  updatedAt?: string;
};

/** User-facing message persisted in CollaborationMessages. */
export type ServiceAiMessageRole = "user" | "assistant";

export type ServiceAiMessageRecord = {
  id: string;
  conversationId: string;
  channelId: string;
  role: ServiceAiMessageRole;
  text: string;
  createdAt: string;
  clientMessageId: string;
  executionId?: string;
  artifactId?: string;
  /** Stable dedupe key — maps to clientMessageId for idempotent upsert. */
  dedupeKey: string;
  routes?: Array<{
    id: string;
    label: string;
    title: string;
    imageUri?: string;
    recommended?: boolean;
    visualStatus?: "pending" | "ready" | "failed";
    visualError?: string;
    /** P4.7 — child assets within a route (e.g. multiple logos). */
    assets?: Array<{
      id: string;
      label?: string;
      imageUri?: string;
      artifactId?: string;
    }>;
  }>;
  clarification?: Record<string, unknown>;
  failed?: boolean;
  intentChip?: string;
  mediaUri?: string;
};

/** Deterministic execution input derived from conversation — not raw chat dump. */
export type ServiceExecutionContext = {
  conversationId: string;
  channelId: string;
  intent: ServiceFollowUpIntent;
  latestUserInstruction: string;
  priorUserInstructions: string[];
  originalUserBrief?: string;
  service?: string;
  subtype?: string;
  platform?: string;
  format?: string;
  category?: string;
  brandId?: string;
  productPath?: string;
  activeExecutionId?: string;
  activeArtifactId?: string;
  selectedRouteId?: string;
  selectedRouteTitle?: string;
  refineFromExecutionId?: string;
  exportFormat?: "pdf" | "pptx" | "docx" | "html" | "zip";
  executionIds: string[];
  /** P4.5 — resolved conversational action (advisory). */
  conversationalAction?: ConversationalAction;
  requiresExecution?: boolean;
  clarificationRequired?: boolean;
  clarificationQuestion?: string;
  /** P4.9.7.1 — structured clarification payload (logo selection, etc.). */
  clarification?: import("./conversational-task-intelligence/conversational-task-contract").ConversationalClarification;
  effectiveRequirements?: readonly ConversationalRequirement[];
  effectiveInstruction?: string;
  activeThreadId?: string;
  referencedExecutionId?: string;
  referencedArtifactId?: string;
  referencedRouteId?: string;
  referencedTargetAssetIds?: readonly string[];
  referencedTargetAssets?: readonly Array<{
    id: string;
    label?: string;
    imageUri?: string;
    artifactId?: string;
  }>;
  /** P4.6 — canonical resolved execution specification. */
  executionSpec?: CanonicalExecutionSpecification;
};
