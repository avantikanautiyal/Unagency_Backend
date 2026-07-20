/**
 * AI session contracts — no provider-specific logic.
 */

export interface StudioAiSessionRefs {
  readonly executionId?: string;
  readonly workspaceId: string;
  readonly capabilityId?: string;
  readonly brandId?: string;
  readonly knowledgeContextId?: string;
  readonly brandBrainEnrichmentId?: string;
  readonly evaluationId?: string;
  readonly experienceId?: string;
  readonly historyEntryIds: readonly string[];
}

export interface StudioAiSession {
  readonly sessionId: string;
  readonly organizationId: string;
  readonly title: string;
  readonly status: "idle" | "running" | "completed" | "failed" | "cancelled";
  readonly refs: StudioAiSessionRefs;
  readonly messageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}
