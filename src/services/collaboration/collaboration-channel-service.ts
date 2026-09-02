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
  productPath?: string;
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
      productPath: input.productPath,
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

  /**
   * CS ↔ Resource task workspace — one room per project (not client service chat).
   */
  async ensureForProject(input: {
    actorUserId: string;
    projectId: string;
    extraMemberUserIds?: string[];
  }): Promise<CollaborationChannelDto> {
    const Projects = (await import("../../models/projects.model")).default;
    const Staff = (await import("../../models/staff.model")).default;
    const Users = (await import("../../models/users.model")).default;
    const Tasks = (await import("../../models/tasks.model")).default;

    const resolveUserId = async (raw: string): Promise<string | null> => {
      const id = String(raw ?? "").trim();
      if (!id) return null;
      const asUser = await Users.findById(id).select("_id");
      if (asUser?._id) return String(asUser._id);
      const asStaff = await Staff.findById(id).select("userId");
      if (asStaff?.userId) return String(asStaff.userId);
      const byStaffUser = await Staff.findOne({ userId: id }).select("userId");
      if (byStaffUser?.userId) return String(byStaffUser.userId);
      return id;
    };

    const project = await Projects.findById(input.projectId).select(
      "title userId orgId resource"
    );
    if (!project) {
      throw new Error("Project not found");
    }

    const memberUserIds = new Set<string>();
    const addMember = async (raw?: string) => {
      if (!raw) return;
      const resolved = await resolveUserId(raw);
      if (resolved) memberUserIds.add(resolved);
    };

    await addMember(input.actorUserId);
    for (const raw of input.extraMemberUserIds ?? []) {
      await addMember(raw);
    }

    const customer = await Users.findById(project.userId).select(
      "relationship_manager"
    );
    if (customer?.relationship_manager) {
      await addMember(String(customer.relationship_manager));
    }

    if (Array.isArray(project.resource)) {
      for (const staffId of project.resource) {
        await addMember(String(staffId));
      }
    }

    const taskRows = await Tasks.find({ project: project._id })
      .select("assignedTo")
      .populate({ path: "assignedTo", select: "userId" });
    for (const task of taskRows) {
      const assigned = task.assignedTo as { userId?: unknown; _id?: unknown } | null;
      if (assigned?._id) await addMember(String(assigned._id));
      const uid =
        assigned?.userId != null
          ? typeof assigned.userId === "object" &&
            assigned.userId &&
            "_id" in (assigned.userId as object)
            ? String((assigned.userId as { _id: unknown })._id)
            : String(assigned.userId)
          : "";
      if (uid) await addMember(uid);
    }

    const orgId = String(project.orgId || "");
    if (!orgId) {
      throw new Error("Project organization is required for collaboration");
    }

    const provisioned = await this.provisionForProject({
      projectId: String(project._id),
      name: String(project.title || "Project"),
      organizationId: orgId,
      memberUserIds: [...memberUserIds],
      createdByUserId: input.actorUserId,
    });

    const channels = await this.listChannelsForUser(input.actorUserId);
    const found = channels.find((c) => c.channelId === provisioned.channelId);
    if (found) return found;

    return {
      channelId: provisioned.channelId,
      cid: provisioned.cid,
      name: String(project.title || "Project"),
      entityKind: "project",
      entityId: String(project._id),
      organizationId: orgId,
      projectId: String(project._id),
      createdByUserId: input.actorUserId,
    };
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
    options?: { brandId?: string; productPath?: string }
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
      productPath: r.productPath,
      createdByUserId: r.createdByUserId,
      unreadCount: r.unreadCount,
      lastMessagePreview: r.lastMessagePreview,
      memberRole: r.memberRole as CollaborationMemberRole | undefined,
    }));
    const brandId = options?.brandId?.trim();
    const productPath = options?.productPath?.trim();
    return mapped.filter((c) => {
      if (brandId) {
        const brandMatch =
          c.brandId === brandId ||
          (c.entityKind === "brand" && c.entityId === brandId);
        if (!brandMatch) return false;
      }
      if (productPath && c.productPath !== productPath) return false;
      return true;
    });
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
      createdByUserId: input.userId,
    };
  }

  /**
   * One stable room per (client + brand + productPath/service).
   * Always includes the client's relationship manager (CS) as a member.
   */
  async ensureForService(input: {
    userId: string;
    brandId: string;
    productPath: string;
    serviceLabel?: string;
    /** Admin oversight — load brand by id if customer membership lookup fails */
    allowOversightBrandLoad?: boolean;
  }): Promise<CollaborationChannelDto> {
    const crypto = await import("crypto");
    const { brandService } = await import("../brand-service");
    const Brands = (await import("../../models/brand.model")).default;
    const Users = (await import("../../models/users.model")).default;
    const Staff = (await import("../../models/staff.model")).default;
    const { ApiError } = await import("../../utils/apiError");

    const productPath = input.productPath.trim();
    if (!productPath || productPath === "unspecified") {
      throw new Error("productPath is required for service chat");
    }

    let brandOrgId: string;
    let brandName: string;
    let brandMemberUserIds: string[];
    let brandId: string;

    try {
      const brand = await brandService.get({
        userId: input.userId,
        brandId: input.brandId,
      });
      brandOrgId = brand.organizationId;
      brandName = brand.name;
      brandMemberUserIds = brand.memberUserIds;
      brandId = brand.id;
    } catch (err) {
      if (!input.allowOversightBrandLoad) throw err;
      const doc = await Brands.findById(input.brandId);
      if (!doc) throw new ApiError("Brand not found", 404);
      brandOrgId = doc.organizationId.toString();
      brandName = doc.name;
      brandMemberUserIds = (doc.memberUserIds ?? []).map((id) => id.toString());
      brandId = doc._id.toString();
    }

    const memberUserIds = new Set<string>([
      input.userId,
      ...(brandMemberUserIds.length > 0 ? brandMemberUserIds : [input.userId]),
    ]);

    const customer = await Users.findById(input.userId).select(
      "relationship_manager name"
    );
    if (customer?.relationship_manager) {
      const staff = await Staff.findById(customer.relationship_manager).select(
        "userId"
      );
      if (staff?.userId) {
        memberUserIds.add(String(staff.userId));
      }
    }

    const oversightUsers = await Users.find({
      role: { $in: ["admin", "superadmin"] },
    })
      .select("_id")
      .lean();
    for (const oversightUser of oversightUsers) {
      memberUserIds.add(String(oversightUser._id));
    }

    const entityId = crypto
      .createHash("sha256")
      .update(`${input.userId}|${brandId}|${productPath}`)
      .digest("hex")
      .slice(0, 40);

    const label =
      input.serviceLabel?.trim() ||
      productPath.split("/").filter(Boolean).join(" · ") ||
      "Service";
    const name = `${brandName} · ${label}`;

    const provisioned = await this.provision({
      entityKind: "service",
      entityId,
      name,
      organizationId: brandOrgId,
      memberUserIds: [...memberUserIds],
      createdByUserId: input.userId,
      brandId,
      productPath,
      memberRoles: {
        [input.userId]: "client",
        ...Object.fromEntries(
          [...memberUserIds]
            .filter((id) => id !== input.userId)
            .map((id) => {
              const oversight = oversightUsers.some(
                (user) => String(user._id) === id
              );
              return [
                id,
                oversight
                  ? ("viewer" as CollaborationMemberRole)
                  : ("manager" as CollaborationMemberRole),
              ];
            })
        ),
      },
    });

    const channels = await this.listChannelsForUser(input.userId, {
      brandId,
      productPath,
    });
    const found = channels.find((c) => c.channelId === provisioned.channelId);
    if (found) return found;

    return {
      channelId: provisioned.channelId,
      cid: provisioned.cid,
      name,
      entityKind: "service",
      entityId,
      organizationId: brandOrgId,
      brandId,
      productPath,
      createdByUserId: input.userId,
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
