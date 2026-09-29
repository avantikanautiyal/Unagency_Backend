/**
 * Phase 13 — Conversation ↔ execution ↔ artifact linkage (metadata only).
 * Reuses existing create-path fields; does not invent a new store.
 */

export const CONVERSATIONAL_LINKAGE_META = {
  applied: "conversationalTurnLinkageApplied",
  conversationId: "conversationalLinkageConversationId",
  channelId: "conversationalLinkageChannelId",
  executionId: "conversationalLinkageExecutionId",
  cdfSessionId: "conversationalLinkageCdfSessionId",
  cdfPhaseId: "conversationalLinkageCdfPhaseId",
  artifactId: "conversationalLinkageArtifactId",
  artifactVersion: "conversationalLinkageArtifactVersion",
  upstreamArtifactVersions: "conversationalLinkageUpstreamArtifactVersions",
} as const;

export type ConversationalTurnLinkage = {
  readonly conversationId?: string;
  readonly channelId?: string;
  readonly executionId?: string;
  readonly cdfSessionId?: string;
  readonly cdfPhaseId?: string;
  readonly artifactId?: string;
  readonly artifactVersion?: number;
  readonly upstreamArtifactVersions: readonly string[];
};

/**
 * Stamp typed turn linkage onto metadata when IDs are already known.
 * Never invents conversation or artifact identities.
 */
export function stampConversationalTurnLinkage(
  metadata: Record<string, unknown>,
  linkage: ConversationalTurnLinkage,
): Record<string, unknown> {
  const hasAny =
    Boolean(linkage.conversationId) ||
    Boolean(linkage.channelId) ||
    Boolean(linkage.executionId) ||
    Boolean(linkage.artifactId) ||
    linkage.upstreamArtifactVersions.length > 0;
  if (!hasAny) {
    return {
      ...metadata,
      [CONVERSATIONAL_LINKAGE_META.applied]: false,
    };
  }
  return {
    ...metadata,
    [CONVERSATIONAL_LINKAGE_META.applied]: true,
    ...(linkage.conversationId
      ? { [CONVERSATIONAL_LINKAGE_META.conversationId]: linkage.conversationId }
      : {}),
    ...(linkage.channelId
      ? { [CONVERSATIONAL_LINKAGE_META.channelId]: linkage.channelId }
      : {}),
    ...(linkage.executionId
      ? { [CONVERSATIONAL_LINKAGE_META.executionId]: linkage.executionId }
      : {}),
    ...(linkage.cdfSessionId
      ? { [CONVERSATIONAL_LINKAGE_META.cdfSessionId]: linkage.cdfSessionId }
      : {}),
    ...(linkage.cdfPhaseId
      ? { [CONVERSATIONAL_LINKAGE_META.cdfPhaseId]: linkage.cdfPhaseId }
      : {}),
    ...(linkage.artifactId
      ? { [CONVERSATIONAL_LINKAGE_META.artifactId]: linkage.artifactId }
      : {}),
    ...(typeof linkage.artifactVersion === "number"
      ? {
          [CONVERSATIONAL_LINKAGE_META.artifactVersion]: linkage.artifactVersion,
        }
      : {}),
    [CONVERSATIONAL_LINKAGE_META.upstreamArtifactVersions]: [
      ...linkage.upstreamArtifactVersions,
    ],
  };
}

export function readConversationalTurnLinkage(
  metadata: Readonly<Record<string, unknown>> | undefined,
): ConversationalTurnLinkage | null {
  if (!metadata || metadata[CONVERSATIONAL_LINKAGE_META.applied] !== true) {
    return null;
  }
  const upstream = Array.isArray(
    metadata[CONVERSATIONAL_LINKAGE_META.upstreamArtifactVersions],
  )
    ? (metadata[CONVERSATIONAL_LINKAGE_META.upstreamArtifactVersions] as string[])
    : [];
  return {
    conversationId:
      typeof metadata[CONVERSATIONAL_LINKAGE_META.conversationId] === "string"
        ? (metadata[CONVERSATIONAL_LINKAGE_META.conversationId] as string)
        : undefined,
    channelId:
      typeof metadata[CONVERSATIONAL_LINKAGE_META.channelId] === "string"
        ? (metadata[CONVERSATIONAL_LINKAGE_META.channelId] as string)
        : undefined,
    executionId:
      typeof metadata[CONVERSATIONAL_LINKAGE_META.executionId] === "string"
        ? (metadata[CONVERSATIONAL_LINKAGE_META.executionId] as string)
        : undefined,
    cdfSessionId:
      typeof metadata[CONVERSATIONAL_LINKAGE_META.cdfSessionId] === "string"
        ? (metadata[CONVERSATIONAL_LINKAGE_META.cdfSessionId] as string)
        : undefined,
    cdfPhaseId:
      typeof metadata[CONVERSATIONAL_LINKAGE_META.cdfPhaseId] === "string"
        ? (metadata[CONVERSATIONAL_LINKAGE_META.cdfPhaseId] as string)
        : undefined,
    artifactId:
      typeof metadata[CONVERSATIONAL_LINKAGE_META.artifactId] === "string"
        ? (metadata[CONVERSATIONAL_LINKAGE_META.artifactId] as string)
        : undefined,
    artifactVersion:
      typeof metadata[CONVERSATIONAL_LINKAGE_META.artifactVersion] === "number"
        ? (metadata[CONVERSATIONAL_LINKAGE_META.artifactVersion] as number)
        : undefined,
    upstreamArtifactVersions: upstream,
  };
}

/**
 * Derive linkage summary from orchestrator metadata + intent (no new DB).
 */
export function deriveConversationalTurnLinkage(input: {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly conversationId?: string;
  readonly channelId?: string;
  readonly executionId?: string;
  readonly producedArtifactId?: string;
  readonly producedArtifactVersion?: number;
}): ConversationalTurnLinkage {
  const meta = input.metadata;
  const upstream = Array.isArray(meta.cdfArtifactVersions)
    ? (meta.cdfArtifactVersions as string[])
    : [];
  return {
    conversationId:
      input.conversationId ??
      (typeof meta.conversationId === "string" ? meta.conversationId : undefined),
    channelId:
      input.channelId ??
      (typeof meta.channelId === "string" ? meta.channelId : undefined),
    executionId:
      input.executionId ??
      (typeof meta.apiExecutionId === "string"
        ? meta.apiExecutionId
        : typeof meta.executionId === "string"
          ? meta.executionId
          : undefined),
    cdfSessionId:
      typeof meta.cdfSessionId === "string" ? meta.cdfSessionId : undefined,
    cdfPhaseId:
      typeof meta.cdfPhaseId === "string" ? meta.cdfPhaseId : undefined,
    artifactId: input.producedArtifactId,
    artifactVersion: input.producedArtifactVersion,
    upstreamArtifactVersions: upstream,
  };
}
