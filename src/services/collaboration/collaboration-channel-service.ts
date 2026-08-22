/**
 * M10.19 — Collaboration channel facade (UNAGENCY Collaboration OS).
 * Replaces GetStream transport with first-party persistence + Socket.IO.
 */

import { collaborationOsService } from "../../platform/collaboration/collaboration-os-service";
import {
  mapLegacyRoleToCollaborationRole,
  type CollaborationChannelDto,
  type CollaborationMemberDto,
  type CollaborationMemberRole,
  type CollaborationMessageDto,
  type CollaborationMessageType,
  type CollaborationEntityKind,
} from "./collaboration-types";
import { buildRoomKey } from "../../platform/collaboration/models";

export type ProvisionChannelInput = {
  entityKind: CollaborationEntityKind;
  entityId: string;
  name: string;
  organizationId: string;
  memberUserIds: string[];
  createdByUserId: string;
  projectId?: string;
  brandId?: string;
  briefId?: string;
  executionId?: string;
  campaignId?: string;
  memberRoles?: Record<string, CollaborationMemberRole>;
};

export type ProvisionChannelResult = {
  channelId: string;
  cid: string;
  created: boolean;
};

export class CollaborationChannelService {
  /** Always true — Collaboration OS is first-party (no Stream keys). */
  isConfigured(): boolean {
    return true;
  }

  /**
   * Bootstrap for FE — returns socket auth hint (Firebase token reused on socket).
   * No third-party chat token.
   */
  async issueToken(input: {
    userId: string;
    userRole?: string;
    name?: string;
    email?: string;
  }): Promise<{
    token: string;
    userId: string;
    apiKey: string;
    role: CollaborationMemberRole;
    transport: "unagency-socket";
    socketPath: string;
  }> {
    return {
      // Client continues using Firebase ID token for Socket.IO auth
      token: "use-firebase-id-token",
      userId: input.userId,
      apiKey: "unagency-collaboration-os",
      role: mapLegacyRoleToCollaborationRole(input.userRole),
      transport: "unagency-socket",
      socketPath: "/collaboration/socket.io",
    };
  }

  async provision(input: ProvisionChannelInput): Promise<ProvisionChannelResult> {
    const result = await collaborationOsService.provision({
      entityKind: input.entityKind as any,
      entityId: input.entityId,
      name: input.name,
      organizationId: input.organizationId,
      memberUserIds: input.memberUserIds,
      createdByUserId: input.createdByUserId,
      projectId: input.projectId,
      brandId: input.brandId,
      briefId: input.briefId,
      executionId: input.executionId,
      campaignId: input.campaignId,
      memberRoles: input.memberRoles as any,
    });
    return {
      channelId: result.channelId,
      cid: `unagency:${result.channelId}`,
      created: result.created,
    };
  }

  async provisionForProject(input: {
    projectId: string;
    name: string;
    organizationId: string;
    memberUserIds: string[];
    createdByUserId: string;
  }) {
    return this.provision({
      entityKind: "project",
      entityId: input.projectId,
      name: input.name,
      organizationId: input.organizationId,
      memberUserIds: input.memberUserIds,
      createdByUserId: input.createdByUserId,
      projectId: input.projectId,
    });
  }

  async provisionForBrand(input: {
    brandId: string;
    name: string;
    organizationId: string;
    memberUserIds: string[];
    createdByUserId: string;
  }) {
    return this.provision({
      entityKind: "brand",
      entityId: input.brandId,
      name: `${input.name} Brand`,
      organizationId: input.organizationId,
      memberUserIds: input.memberUserIds,
      createdByUserId: input.createdByUserId,
      brandId: input.brandId,
    });
  }

  async provisionForBrief(input: {
    briefId: string;
    name: string;
    organizationId: string;
    memberUserIds: string[];
    createdByUserId: string;
    projectId?: string;
    brandId?: string;
  }) {
    return this.provision({
      entityKind: "brief",
      entityId: input.briefId,
      name: input.name || "Brief",
      organizationId: input.organizationId,
      memberUserIds: input.memberUserIds,
      createdByUserId: input.createdByUserId,
      projectId: input.projectId,
      brandId: input.brandId,
      briefId: input.briefId,
    });
  }

  async provisionForExecution(input: {
    executionId: string;
    name: string;
    organizationId: string;
    memberUserIds: string[];
    createdByUserId: string;
    projectId?: string;
    brandId?: string;
  }) {
    return this.provision({
      entityKind: "execution",
      entityId: input.executionId,
      name: input.name || "Execution",
      organizationId: input.organizationId,
      memberUserIds: input.memberUserIds,
      createdByUserId: input.createdByUserId,
      projectId: input.projectId,
      brandId: input.brandId,
      executionId: input.executionId,
    });
  }

  async assertMembership(userId: string, channelId: string): Promise<void> {
    await collaborationOsService.assertMembership(userId, channelId);
  }

  async listChannelsForUser(
    userId: string,
    options?: { brandId?: string }
  ): Promise<CollaborationChannelDto[]> {
    const rows = await collaborationOsService.listConversationsForUser(userId);
    const mapped = rows.map((r) => ({
      channelId: r.channelId,
      cid: r.cid,
      name: r.name,
      entityKind: r.entityKind as CollaborationEntityKind,
      entityId: r.entityId,
      organizationId: r.organizationId,
      projectId: r.projectId,
      brandId: r.brandId,
      briefId: r.briefId,
      executionId: r.executionId,
      unreadCount: r.unreadCount,
      lastMessagePreview: r.lastMessagePreview,
      memberRole: r.memberRole as CollaborationMemberRole | undefined,
    }));
    const brandId = options?.brandId?.trim();
    if (!brandId) return mapped;
    return mapped.filter(
      (c) =>
        c.brandId === brandId ||
        (c.entityKind === "brand" && c.entityId === brandId)
    );
  }

  /**
   * Open (or create) the collaboration channel for a product brand the
   * caller already owns. Used when chat opens after Choose Brand so we
   * never fall back to a different brand's room.
   */
  async ensureForBrand(input: {
    userId: string;
    brandId: string;
  }): Promise<CollaborationChannelDto> {
    const { brandService } = await import("../brand-service");
    const brand = await brandService.get({
      userId: input.userId,
      brandId: input.brandId,
    });
    const provisioned = await this.provisionForBrand({
      brandId: brand.id,
      name: brand.name,
      organizationId: brand.organizationId,
      memberUserIds:
        brand.memberUserIds.length > 0 ? brand.memberUserIds : [input.userId],
      createdByUserId: input.userId,
    });
    const channels = await this.listChannelsForUser(input.userId, {
      brandId: brand.id,
    });
    const found = channels.find((c) => c.channelId === provisioned.channelId);
    if (found) return found;
    return {
      channelId: provisioned.channelId,
      cid: provisioned.cid,
      name: `${brand.name} Brand`,
      entityKind: "brand",
      entityId: brand.id,
      organizationId: brand.organizationId,
      brandId: brand.id,
    };
  }

  async listMembers(input: {
    userId: string;
    channelId: string;
  }): Promise<CollaborationMemberDto[]> {
    const rows = await collaborationOsService.listMembers(input);
    return rows.map((r) => ({
      userId: r.userId,
      role: r.role as CollaborationMemberRole,
      name: r.name,
      email: r.email,
      image: r.image,
    }));
  }

  async listMessages(input: {
    userId: string;
    channelId: string;
    limit?: number;
    parentId?: string;
  }): Promise<CollaborationMessageDto[]> {
    const rows = await collaborationOsService.listMessages(input);
    return rows.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      text: m.text,
      messageType: m.messageType as CollaborationMessageType,
      fromUserId: m.fromUserId,
      createdAt: m.createdAt,
      parentId: m.parentId,
      threadId: m.threadId,
      assetId: m.assetId,
      artifactId: m.artifactId,
      executionId: m.executionId,
      approvalId: m.approvalId,
      metadata: m.metadata,
      status: m.status,
    }));
  }

  async sendMessage(input: {
    userId: string;
    channelId: string;
    text: string;
    messageType?: CollaborationMessageType;
    parentId?: string;
    assetId?: string;
    artifactId?: string;
    executionId?: string;
    approvalId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CollaborationMessageDto> {
    const m = await collaborationOsService.sendMessage({
      ...input,
      messageType: input.messageType as any,
    });
    return {
      id: m.id,
      channelId: m.channelId,
      text: m.text,
      messageType: m.messageType as CollaborationMessageType,
      fromUserId: m.fromUserId,
      createdAt: m.createdAt,
      parentId: m.parentId,
      threadId: m.threadId,
      assetId: m.assetId,
      artifactId: m.artifactId,
      executionId: m.executionId,
      approvalId: m.approvalId,
      metadata: m.metadata,
      status: m.status,
    };
  }

  async addMembers(input: {
    actorUserId: string;
    channelId: string;
    memberUserIds: string[];
    roles?: Record<string, CollaborationMemberRole>;
  }): Promise<void> {
    await collaborationOsService.addMembers(input as any);
  }

  async removeMembers(input: {
    actorUserId: string;
    channelId: string;
    memberUserIds: string[];
  }): Promise<void> {
    await collaborationOsService.removeMembers(input);
  }
}

export const collaborationChannelService = new CollaborationChannelService();

export { buildRoomKey as buildChannelId };
