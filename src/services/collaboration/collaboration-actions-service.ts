/**
 * M10.19 — AI / approvals / artifacts inside chat.
 * Always goes through UNAGENCY execution + product domains — never direct providers.
 */

import { collaborationChannelService } from "./collaboration-channel-service";
import { productAssetService } from "../product-asset-service";
import { ApiError } from "../../utils/apiError";
import type { CollaborationMessageDto } from "./collaboration-types";

export class CollaborationActionsService {
  /** Post an asset reference into a channel — no byte duplication. */
  async shareAsset(input: {
    userId: string;
    channelId: string;
    assetId: string;
    parentId?: string;
  }): Promise<CollaborationMessageDto> {
    const asset = await productAssetService.get({
      userId: input.userId,
      assetId: input.assetId,
    });
    const messageType =
      asset.kind === "image"
        ? "image"
        : asset.kind === "video"
          ? "video"
          : asset.kind === "audio"
            ? "voice"
            : asset.kind === "document"
              ? "document"
              : "brand_asset";
    return collaborationChannelService.sendMessage({
      userId: input.userId,
      channelId: input.channelId,
      text: `Shared asset: ${asset.name}`,
      messageType: messageType as any,
      parentId: input.parentId,
      assetId: asset.id,
      metadata: {
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        kind: asset.kind,
        brandId: asset.brandId,
      },
    });
  }

  /** Share execution artifact reference (id only). */
  async shareArtifact(input: {
    userId: string;
    channelId: string;
    artifactId: string;
    executionId?: string;
    label?: string;
    parentId?: string;
  }): Promise<CollaborationMessageDto> {
    return collaborationChannelService.sendMessage({
      userId: input.userId,
      channelId: input.channelId,
      text: input.label || `Shared artifact ${input.artifactId}`,
      messageType: "execution_artifact",
      parentId: input.parentId,
      artifactId: input.artifactId,
      executionId: input.executionId,
    });
  }

  /**
   * Invoke AI from chat — posts a system placeholder then expects FE/gateway
   * to create an execution via Execution Gateway. Never calls providers here.
   */
  async invokeAiPlaceholder(input: {
    userId: string;
    channelId: string;
    prompt: string;
    parentId?: string;
    brandId?: string;
    organizationId?: string;
  }): Promise<{
    message: CollaborationMessageDto;
    executionHint: {
      capabilityHint: string;
      prompt: string;
      brandId?: string;
      organizationId?: string;
      channelId: string;
    };
  }> {
    if (!input.prompt.trim()) throw new ApiError("Prompt required", 400);
    const message = await collaborationChannelService.sendMessage({
      userId: input.userId,
      channelId: input.channelId,
      text: input.prompt.trim(),
      messageType: "ai_response",
      parentId: input.parentId,
      metadata: {
        phase: "queued_for_execution_gateway",
        brandId: input.brandId,
        organizationId: input.organizationId,
      },
    });
    return {
      message,
      executionHint: {
        capabilityHint: "text.generate",
        prompt: input.prompt.trim(),
        brandId: input.brandId,
        organizationId: input.organizationId,
        channelId: input.channelId,
      },
    };
  }

  /** Post approval request card into conversation. */
  async postApprovalRequest(input: {
    userId: string;
    channelId: string;
    approvalId: string;
    executionId?: string;
    summary: string;
    parentId?: string;
  }): Promise<CollaborationMessageDto> {
    return collaborationChannelService.sendMessage({
      userId: input.userId,
      channelId: input.channelId,
      text: input.summary,
      messageType: "approval_card",
      parentId: input.parentId,
      approvalId: input.approvalId,
      executionId: input.executionId,
      metadata: {
        actions: ["approve", "reject", "resume"],
      },
    });
  }

  /** Record approval decision as a thread reply — actual approve via toolApprovals API. */
  async postApprovalDecision(input: {
    userId: string;
    channelId: string;
    approvalId: string;
    decision: "approve" | "reject" | "resume";
    executionId?: string;
    parentId?: string;
    note?: string;
  }): Promise<CollaborationMessageDto> {
    return collaborationChannelService.sendMessage({
      userId: input.userId,
      channelId: input.channelId,
      text: input.note || `Approval ${input.decision}`,
      messageType: "approval_card",
      parentId: input.parentId,
      approvalId: input.approvalId,
      executionId: input.executionId,
      metadata: {
        decision: input.decision,
      },
    });
  }

  /** Voice → already transcribed text becomes a voice message + optional AI context. */
  async postVoiceTranscript(input: {
    userId: string;
    channelId: string;
    transcript: string;
    assetId?: string;
    parentId?: string;
  }): Promise<CollaborationMessageDto> {
    return collaborationChannelService.sendMessage({
      userId: input.userId,
      channelId: input.channelId,
      text: input.transcript,
      messageType: "voice",
      parentId: input.parentId,
      assetId: input.assetId,
      metadata: { source: "m10.15_voice" },
    });
  }
}

export const collaborationActionsService = new CollaborationActionsService();
