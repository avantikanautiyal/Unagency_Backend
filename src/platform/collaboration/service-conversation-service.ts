/**
 * Service AI conversation authority — persistent, context-aware service chat.
 * Extends Collaboration OS (single store); does not duplicate conversation persistence.
 */

import mongoose from "mongoose";
import { ApiError } from "../../utils/apiError";
import { collaborationOsService } from "./collaboration-os-service";
import {
  CollabMessage,
  Conversation,
  MessageAttachment,
  type ICollabMessage,
} from "./models";
import { EnterpriseExecution } from "../infrastructure/durability/mongo/models/enterprise-execution.model";
import {
  buildExecutionContextFromConversation,
  isInternalExecutionPrompt,
  mergeServiceAiMessages,
  visibleUserText,
} from "./service-conversation-context";
import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
  ServiceExecutionContext,
} from "./service-conversation-types";
import {
  applyExecutionOutcomeToThread,
  classifySemanticSignals,
  ensureTaskIntelligenceState,
  resolveConversationalTurn,
  updateTaskStateThread,
} from "./conversational-task-intelligence";
import type { ConversationalTurnResolution } from "./conversational-task-intelligence";
import { discoverAuthoritativeLogoInputs } from "./conversational-task-intelligence/discover-authoritative-logo-inputs";
import { getEnterpriseApiRuntime } from "../api/runtime/bootstrap-enterprise-api";
import type { SemanticSignals } from "./conversational-task-intelligence/semantic-signals";

function parseAiState(raw: unknown): ServiceAiConversationState {
  if (!raw || typeof raw !== "object") return {};
  return raw as ServiceAiConversationState;
}

async function classifyTurnSignals(input: {
  message: string;
  organizationId: string;
  hasActiveDeliverable: boolean;
}): Promise<{
  signals: SemanticSignals;
  isSubstantiveNewGeneration: boolean;
}> {
  const integration =
    getEnterpriseApiRuntime()?.platform?.integrationEngine;
  const classified = await classifySemanticSignals({
    message: input.message,
    organizationId: input.organizationId,
    integration,
    hasActiveDeliverable: input.hasActiveDeliverable,
  });
  const {
    source: _source,
    confidence: _confidence,
    isSubstantiveNewGeneration,
    ...signals
  } = classified;
  return { signals, isSubstantiveNewGeneration };
}

function toAiMessage(
  doc: ICollabMessage,
  channelId: string
): ServiceAiMessageRecord | null {
  const meta =
    doc.metadata && typeof doc.metadata === "object"
      ? (doc.metadata as Record<string, unknown>)
      : {};
  const aiKind = typeof meta.aiKind === "string" ? meta.aiKind : undefined;
  const role: "user" | "assistant" =
    doc.messageType === "text" && doc.senderUserId
      ? "user"
      : "assistant";

  const text = visibleUserText(doc.text);
  if (!text && aiKind !== "routes" && !meta.routes) {
    if (isInternalExecutionPrompt(doc.text)) return null;
  }

  const dedupeKey =
    (typeof meta.dedupeKey === "string" && meta.dedupeKey) ||
    doc.clientMessageId ||
    doc._id.toString();

  return {
    id: doc._id.toString(),
    conversationId: doc.conversationId.toString(),
    channelId,
    role,
    text: text || String(doc.text || ""),
    createdAt: (doc as { createdAt?: Date }).createdAt
      ? new Date((doc as { createdAt?: Date }).createdAt!).toISOString()
      : new Date().toISOString(),
    clientMessageId: doc.clientMessageId || dedupeKey,
    dedupeKey,
    executionId: doc.executionId,
    artifactId: doc.artifactId,
    ...(Array.isArray(meta.routes) ? { routes: meta.routes as ServiceAiMessageRecord["routes"] } : {}),
    ...(meta.clarification && typeof meta.clarification === "object"
      ? { clarification: meta.clarification as Record<string, unknown> }
      : {}),
    ...(meta.failed === true ? { failed: true } : {}),
    ...(typeof meta.intentChip === "string" ? { intentChip: meta.intentChip } : {}),
    ...(typeof meta.mediaUri === "string" ? { mediaUri: meta.mediaUri } : {}),
  };
}

export class ServiceConversationService {
  async getState(input: {
    userId: string;
    channelId: string;
  }): Promise<{
    conversationId: string;
    channelId: string;
    state: ServiceAiConversationState;
  }> {
    const { conversation } = await collaborationOsService.assertMembership(
      input.userId,
      input.channelId
    );
    return {
      conversationId: conversation._id.toString(),
      channelId: conversation.roomKey,
      state: parseAiState(conversation.aiState),
    };
  }

  async updateState(input: {
    userId: string;
    channelId: string;
    patch: Partial<ServiceAiConversationState>;
  }): Promise<ServiceAiConversationState> {
    const { conversation } = await collaborationOsService.assertMembership(
      input.userId,
      input.channelId
    );
    const current = parseAiState(conversation.aiState);
    const next: ServiceAiConversationState = {
      ...current,
      ...input.patch,
      updatedAt: new Date().toISOString(),
    };
    conversation.aiState = next as Record<string, unknown>;
    await conversation.save();
    return next;
  }

  async listMessages(input: {
    userId: string;
    channelId: string;
    limit?: number;
  }): Promise<ServiceAiMessageRecord[]> {
    const { conversation } = await collaborationOsService.assertMembership(
      input.userId,
      input.channelId
    );
    const rows = await CollabMessage.find({
      conversationId: conversation._id,
      deletedAt: { $exists: false },
      parentMessageId: { $exists: false },
    })
      .sort({ sequence: 1 })
      .limit(Math.min(input.limit ?? 80, 100));

    const messages: ServiceAiMessageRecord[] = [];
    for (const row of rows) {
      const mapped = toAiMessage(row, conversation.roomKey);
      if (mapped) messages.push(mapped);
    }
    return messages;
  }

  async upsertMessage(input: {
    userId: string;
    channelId: string;
    role: "user" | "assistant";
    text: string;
    clientMessageId: string;
    dedupeKey?: string;
    executionId?: string;
    artifactId?: string;
    routes?: ServiceAiMessageRecord["routes"];
    clarification?: Record<string, unknown>;
    failed?: boolean;
    intentChip?: string;
    mediaUri?: string;
  }): Promise<ServiceAiMessageRecord> {
    if (isInternalExecutionPrompt(input.text) && input.role === "user") {
      throw new ApiError("Internal execution prompts cannot be chat messages", 400);
    }

    const dedupeKey = input.dedupeKey || input.clientMessageId;
    const visibleText = visibleUserText(input.text) || input.text.trim();
    if (!visibleText && !(input.routes?.length ?? 0)) {
      throw new ApiError("Message text or routes required", 400);
    }

    const existing = await CollabMessage.findOne({
      clientMessageId: dedupeKey,
    });
    const { conversation } = await collaborationOsService.assertMembership(
      input.userId,
      input.channelId
    );

    const metadata: Record<string, unknown> = {
      aiKind: input.routes?.length ? "routes" : input.clarification ? "clarification" : "text",
      dedupeKey,
      ...(input.routes ? { routes: input.routes } : {}),
      ...(input.clarification ? { clarification: input.clarification } : {}),
      ...(input.failed ? { failed: true } : {}),
      ...(input.intentChip ? { intentChip: input.intentChip } : {}),
      ...(input.mediaUri ? { mediaUri: input.mediaUri } : {}),
    };

    if (existing && existing.conversationId.toString() === conversation._id.toString()) {
      existing.text = visibleText;
      existing.executionId = input.executionId || existing.executionId;
      existing.artifactId = input.artifactId || existing.artifactId;
      existing.metadata = { ...(existing.metadata ?? {}), ...metadata };
      await existing.save();
      const mapped = toAiMessage(existing, conversation.roomKey);
      if (!mapped) throw new ApiError("Failed to map message", 500);
      return mapped;
    }

    const dto = await collaborationOsService.sendMessage({
      userId: input.userId,
      channelId: input.channelId,
      text: visibleText,
      messageType: input.role === "user" ? "text" : "ai_response",
      clientMessageId: dedupeKey,
      executionId: input.executionId,
      artifactId: input.artifactId,
      metadata,
    });

    return {
      id: dto.id,
      conversationId: dto.conversationId,
      channelId: dto.channelId,
      role: input.role,
      text: visibleText,
      createdAt: dto.createdAt,
      clientMessageId: dedupeKey,
      dedupeKey,
      executionId: dto.executionId,
      artifactId: dto.artifactId,
      routes: input.routes,
      clarification: input.clarification,
      failed: input.failed,
      intentChip: input.intentChip,
      mediaUri: input.mediaUri,
    };
  }

  async linkExecution(input: {
    userId: string;
    channelId: string;
    executionId: string;
    artifactId?: string;
    inProgress?: boolean;
    selectedRouteId?: string;
    selectedRouteTitle?: string;
  }): Promise<ServiceAiConversationState> {
    const { conversationId, state: currentState } = await this.getState({
      userId: input.userId,
      channelId: input.channelId,
    });

    const patch: Partial<ServiceAiConversationState> = {
      inProgressExecutionId: input.inProgress ? input.executionId : undefined,
    };
    if (!input.inProgress) {
      patch.activeExecutionId = input.executionId;
      patch.inProgressExecutionId = undefined;
      if (input.artifactId) patch.activeArtifactId = input.artifactId;
      if (input.selectedRouteId) patch.selectedRouteId = input.selectedRouteId;
      if (input.selectedRouteTitle) {
        patch.selectedRouteTitle = input.selectedRouteTitle;
      }

      const taskState = ensureTaskIntelligenceState(currentState.taskIntelligence);
      const activeThread = taskState.threads.find(
        (t) => t.threadId === taskState.activeThreadId,
      );
      if (activeThread) {
        const updatedThread = applyExecutionOutcomeToThread({
          thread: activeThread,
          executionId: input.executionId,
          artifactId: input.artifactId,
          routeId: input.selectedRouteId,
          routeTitle: input.selectedRouteTitle,
          nowIso: new Date().toISOString(),
        });
        patch.taskIntelligence = updateTaskStateThread(taskState, updatedThread);
      }
    }

    const state = await this.updateState({
      userId: input.userId,
      channelId: input.channelId,
      patch,
    });

    await EnterpriseExecution.updateOne(
      { executionId: input.executionId },
      { $set: { conversationId, channelId: input.channelId } }
    );

    return state;
  }

  async resolveTurn(input: {
    userId: string;
    channelId: string;
    latestUserMessage: string;
    messageId?: string;
    persist?: boolean;
    attachmentLogoAssetIds?: readonly string[];
    vaultLogoChoice?: string;
  }): Promise<ConversationalTurnResolution> {
    const { conversation } = await collaborationOsService.assertMembership(
      input.userId,
      input.channelId,
    );
    const conversationId = conversation._id.toString();
    const channelId = conversation.roomKey;
    const state = parseAiState(conversation.aiState);
    const messages = await this.listMessages({
      userId: input.userId,
      channelId: input.channelId,
    });
    const logoDiscovery = await discoverAuthoritativeLogoInputs({
      organizationId: conversation.organizationId.toString(),
      brandId: state.brandId,
      vaultLogoChoice: input.vaultLogoChoice,
      attachmentLogoAssetIds: input.attachmentLogoAssetIds,
    });
    const taskState = ensureTaskIntelligenceState(state.taskIntelligence);
    const hasActiveDeliverable = Boolean(
      taskState.activeThreadId &&
        taskState.threads.some(
          (t) =>
            t.threadId === taskState.activeThreadId &&
            (t.activeExecutionId || t.activeArtifactId)
        )
    );
    const classified = await classifyTurnSignals({
      message: input.latestUserMessage,
      organizationId: conversation.organizationId.toString(),
      hasActiveDeliverable,
    });
    const resolution = resolveConversationalTurn({
      conversationId,
      channelId,
      messageId: input.messageId,
      latestUserMessage: input.latestUserMessage,
      messages,
      state,
      logoDiscovery,
      signals: classified.signals,
      isSubstantiveNewGeneration: classified.isSubstantiveNewGeneration,
    });
    if (input.persist !== false) {
      await this.updateState({
        userId: input.userId,
        channelId: input.channelId,
        patch: { taskIntelligence: resolution.updatedTaskState },
      });
    }
    return resolution;
  }

  async buildExecutionContext(input: {
    userId: string;
    channelId: string;
    latestUserMessage: string;
    persistTaskIntelligence?: boolean;
    /** When the caller already resolved the turn, skip duplicate resolution. */
    turn?: ConversationalTurnResolution;
    attachmentLogoAssetIds?: readonly string[];
    vaultLogoChoice?: string;
  }): Promise<ServiceExecutionContext> {
    const { conversation } = await collaborationOsService.assertMembership(
      input.userId,
      input.channelId,
    );
    const conversationId = conversation._id.toString();
    const channelId = conversation.roomKey;
    const state = parseAiState(conversation.aiState);
    const messages = await this.listMessages({
      userId: input.userId,
      channelId: input.channelId,
    });
    const logoDiscovery = await discoverAuthoritativeLogoInputs({
      organizationId: conversation.organizationId.toString(),
      brandId: state.brandId,
      vaultLogoChoice: input.vaultLogoChoice,
      attachmentLogoAssetIds: input.attachmentLogoAssetIds,
    });
    let turn = input.turn;
    if (!turn) {
      const taskState = ensureTaskIntelligenceState(state.taskIntelligence);
      const hasActiveDeliverable = Boolean(
        taskState.activeThreadId &&
          taskState.threads.some(
            (t) =>
              t.threadId === taskState.activeThreadId &&
              (t.activeExecutionId || t.activeArtifactId)
          )
      );
      const classified = await classifyTurnSignals({
        message: input.latestUserMessage,
        organizationId: conversation.organizationId.toString(),
        hasActiveDeliverable,
      });
      turn = resolveConversationalTurn({
        conversationId,
        channelId,
        latestUserMessage: input.latestUserMessage,
        messages,
        state,
        logoDiscovery,
        signals: classified.signals,
        isSubstantiveNewGeneration: classified.isSubstantiveNewGeneration,
      });
    }
    if (input.persistTaskIntelligence !== false) {
      await this.updateState({
        userId: input.userId,
        channelId: input.channelId,
        patch: { taskIntelligence: turn.updatedTaskState },
      });
    }
    return buildExecutionContextFromConversation({
      conversationId,
      channelId,
      messages,
      state: {
        ...state,
        taskIntelligence: turn.updatedTaskState,
      },
      latestUserMessage: input.latestUserMessage,
      turn,
    });
  }

  async getFullConversation(input: {
    userId: string;
    channelId: string;
  }): Promise<{
    conversationId: string;
    channelId: string;
    state: ServiceAiConversationState;
    messages: ServiceAiMessageRecord[];
    inProgressExecutionId?: string;
  }> {
    const base = await this.getState(input);
    const messages = await this.listMessages(input);
    return {
      ...base,
      messages,
      inProgressExecutionId: base.state.inProgressExecutionId,
    };
  }

  async listExecutionsForConversation(
    conversationId: string
  ): Promise<string[]> {
    const docs = await EnterpriseExecution.find({ conversationId })
      .select("executionId createdAt")
      .sort({ createdAt: 1 })
      .lean();
    return docs.map((d) => d.executionId);
  }

  /**
   * Soft-delete every message in the service channel and reset deliverable
   * pointers so the conversation starts blank for this brand+service only.
   * Also hard-deletes vault assets generated/approved in this chat.
   */
  async clearHistory(input: {
    userId: string;
    channelId: string;
  }): Promise<{
    deletedCount: number;
    vaultDeletedCount: number;
    state: ServiceAiConversationState;
  }> {
    const { conversation } = await collaborationOsService.assertMembership(
      input.userId,
      input.channelId
    );
    const conversationOid = conversation._id as mongoose.Types.ObjectId;
    const conversationId = conversationOid.toString();

    const [executionIdsFromExec, executionIdsFromMessages, messageAssetIds] =
      await Promise.all([
        this.listExecutionsForConversation(conversationId),
        CollabMessage.distinct("executionId", {
          conversationId: conversationOid,
          executionId: { $type: "string", $gt: "" },
        }) as Promise<string[]>,
        CollabMessage.distinct("assetId", {
          conversationId: conversationOid,
          assetId: { $exists: true },
        }) as Promise<mongoose.Types.ObjectId[]>,
      ]);

    const attachmentDocs = await MessageAttachment.find({
      conversationId: conversationOid,
    })
      .select("productAssetId")
      .lean();

    const executionIds = [
      ...new Set(
        [...executionIdsFromExec, ...executionIdsFromMessages]
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      ),
    ];
    const assetIds = [
      ...new Set(
        [
          ...messageAssetIds.map((id) => String(id)),
          ...attachmentDocs.map((d) => String(d.productAssetId)),
        ].filter((id) => mongoose.isValidObjectId(id))
      ),
    ];

    let vaultDeletedCount = 0;
    try {
      const { productAssetService } = await import(
        "../../services/product-asset-service"
      );
      const vaultResult = await productAssetService.hardDeleteMatching({
        userId: input.userId,
        executionIds,
        assetIds,
      });
      vaultDeletedCount = vaultResult.deletedCount;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/no organisation/i.test(message)) {
        console.warn(
          "[service-conversation] vault cascade on clearHistory failed:",
          message
        );
        throw new ApiError(
          "Could not delete vault assets for this chat. Try again in a moment.",
          503
        );
      }
    }

    await MessageAttachment.deleteMany({ conversationId: conversationOid });
    const result = await CollabMessage.deleteMany({
      conversationId: conversationOid,
    });

    const current = parseAiState(conversation.aiState);
    const now = new Date();
    const next: ServiceAiConversationState = {
      service: current.service,
      subtype: current.subtype,
      platform: current.platform,
      format: current.format,
      category: current.category,
      brandId: current.brandId,
      productPath: current.productPath,
      updatedAt: now.toISOString(),
    };
    conversation.aiState = next as Record<string, unknown>;
    await conversation.save();

    return {
      deletedCount: result.deletedCount ?? 0,
      vaultDeletedCount,
      state: next,
    };
  }
}

export const serviceConversationService = new ServiceConversationService();

export { mergeServiceAiMessages, buildExecutionContextFromConversation };
