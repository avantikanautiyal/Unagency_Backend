/**
 * Phase 13 — Conversational generation intent (provider-neutral).
 * Does not invent conversation identity or rewrite CDF state.
 */

export const CONVERSATIONAL_RUNTIME_SOURCE = "conversational_runtime" as const;

export type ConversationalGenerationIntent = {
  readonly source: typeof CONVERSATIONAL_RUNTIME_SOURCE;
  readonly currentUserInstruction: string;
  readonly conversationId?: string;
  readonly channelId?: string;
  readonly cdfSessionId?: string;
  readonly cdfPhaseId?: string;
  readonly cdfServiceId?: string;
  readonly organizationId?: string;
  readonly projectId?: string;
  readonly executionId?: string;
  readonly referencedExecutionId?: string;
  readonly referencedArtifactId?: string;
  readonly conversationIdentityPresent: boolean;
  readonly inventedConversation: false;
};

/**
 * Build conversational generation intent from create-path metadata + instruction.
 * Never invents conversationId/channelId.
 */
export function buildConversationalGenerationIntent(input: {
  readonly currentUserInstruction: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly organizationId?: string;
  readonly projectId?: string;
}): ConversationalGenerationIntent {
  const meta = input.metadata ?? {};
  const refine =
    typeof meta.refinePrompt === "string" && meta.refinePrompt.trim()
      ? meta.refinePrompt.trim()
      : undefined;
  const stampedCurrent =
    typeof meta.conversationalCurrentUserInstruction === "string" &&
    meta.conversationalCurrentUserInstruction.trim()
      ? meta.conversationalCurrentUserInstruction.trim()
      : undefined;
  const currentUserInstruction =
    (input.currentUserInstruction.trim() ||
      refine ||
      stampedCurrent ||
      "").trim();
  const conversationId =
    typeof meta.conversationId === "string" && meta.conversationId.trim()
      ? meta.conversationId.trim()
      : typeof meta.cdfConversationId === "string" && meta.cdfConversationId.trim()
        ? meta.cdfConversationId.trim()
        : undefined;
  const channelId =
    typeof meta.channelId === "string" && meta.channelId.trim()
      ? meta.channelId.trim()
      : undefined;
  const cdfSessionId =
    typeof meta.cdfSessionId === "string" && meta.cdfSessionId.trim()
      ? meta.cdfSessionId.trim()
      : undefined;
  const cdfPhaseId =
    typeof meta.cdfPhaseId === "string" && meta.cdfPhaseId.trim()
      ? meta.cdfPhaseId.trim()
      : undefined;
  const cdfServiceId =
    typeof meta.cdfServiceId === "string" && meta.cdfServiceId.trim()
      ? meta.cdfServiceId.trim()
      : typeof meta.service === "string" && meta.service.trim()
        ? meta.service.trim()
        : undefined;
  const executionId =
    typeof meta.apiExecutionId === "string" && meta.apiExecutionId.trim()
      ? meta.apiExecutionId.trim()
      : typeof meta.executionId === "string" && meta.executionId.trim()
        ? meta.executionId.trim()
        : undefined;
  const referencedExecutionId =
    typeof meta.conversationalReferencedExecutionId === "string"
      ? meta.conversationalReferencedExecutionId.trim() || undefined
      : undefined;
  const referencedArtifactId =
    typeof meta.conversationalReferencedArtifactId === "string"
      ? meta.conversationalReferencedArtifactId.trim() || undefined
      : undefined;

  return {
    source: CONVERSATIONAL_RUNTIME_SOURCE,
    currentUserInstruction,
    conversationId,
    channelId,
    cdfSessionId,
    cdfPhaseId,
    cdfServiceId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    executionId,
    referencedExecutionId,
    referencedArtifactId,
    conversationIdentityPresent: Boolean(conversationId || channelId),
    inventedConversation: false,
  };
}

/**
 * Stamp intent identity onto metadata for create-path continuity.
 * Does not invent IDs; only normalizes aliases when already present.
 */
export function stampConversationalIntentMetadata(
  metadata: Record<string, unknown>,
  intent: ConversationalGenerationIntent,
): Record<string, unknown> {
  return {
    ...metadata,
    conversationalRuntimeApplied: true,
    conversationalRuntimeSource: CONVERSATIONAL_RUNTIME_SOURCE,
    conversationalIdentityPresent: intent.conversationIdentityPresent,
    conversationalInventedConversation: false,
    ...(intent.currentUserInstruction
      ? {
          conversationalCurrentUserInstruction: intent.currentUserInstruction,
        }
      : {}),
    ...(intent.conversationId
      ? {
          conversationId: intent.conversationId,
          cdfConversationId: intent.conversationId,
        }
      : {}),
    ...(intent.channelId ? { channelId: intent.channelId } : {}),
    ...(intent.executionId
      ? {
          apiExecutionId: metadata.apiExecutionId ?? intent.executionId,
          executionId: metadata.executionId ?? intent.executionId,
        }
      : {}),
  };
}
