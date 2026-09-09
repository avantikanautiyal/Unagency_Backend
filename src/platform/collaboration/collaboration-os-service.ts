/**
 * M10.19 Collaboration OS — conversation & message authority (no third-party chat).
 */

import mongoose from "mongoose";
import { ApiError } from "../../utils/apiError";
import {
  buildRoomKey,
  CollabMessage,
  Conversation,
  ConversationAudit,
  ConversationMember,
  MessageAttachment,
  Mention,
  ReadReceipt,
  Thread,
  type CollabMessageType,
  type ConversationEntityKind,
  type ICollabMessage,
  type IConversation,
  type MemberRole,
} from "./models";
import Notifications from "../../models/notification.model";
import Users from "../../models/users.model";

const OVERSIGHT_ROLES = ["admin", "superadmin"] as const;

async function listOversightUserIds(): Promise<string[]> {
  const rows = await Users.find({ role: { $in: [...OVERSIGHT_ROLES] } })
    .select("_id")
    .lean();
  return rows.map((row) => String(row._id));
}

export type MessageDto = {
  id: string;
  channelId: string;
  conversationId: string;
  text: string;
  messageType: CollabMessageType;
  fromUserId?: string;
  createdAt: string;
  parentId?: string;
  threadId?: string;
  assetId?: string;
  artifactId?: string;
  executionId?: string;
  approvalId?: string;
  sequence: number;
  clientMessageId?: string;
  metadata?: Record<string, unknown>;
  status?: "sending" | "sent" | "failed";
};

export type ConversationDto = {
  channelId: string;
  conversationId: string;
  cid: string;
  name: string;
  entityKind: ConversationEntityKind;
  entityId: string;
  organizationId: string;
  projectId?: string;
  brandId?: string;
  briefId?: string;
  executionId?: string;
  productPath?: string;
  createdByUserId?: string;
  unreadCount?: number;
  lastMessagePreview?: string;
  memberRole?: MemberRole;
};

function toMessageDto(doc: ICollabMessage, roomKey: string): MessageDto {
  return {
    id: doc._id.toString(),
    channelId: roomKey,
    conversationId: doc.conversationId.toString(),
    text: doc.text || "",
    messageType: doc.messageType,
    fromUserId: doc.senderUserId?.toString(),
    createdAt: (doc as any).createdAt
      ? new Date((doc as any).createdAt).toISOString()
      : new Date().toISOString(),
    parentId: doc.parentMessageId?.toString(),
    threadId: doc.parentMessageId?.toString(),
    assetId: doc.assetId?.toString(),
    artifactId: doc.artifactId,
    executionId: doc.executionId,
    approvalId: doc.approvalId,
    sequence: doc.sequence,
    clientMessageId: doc.clientMessageId,
    metadata: doc.metadata,
    status: "sent",
  };
}

function toConversationDto(
  doc: IConversation,
  member?: { unreadCount?: number; role?: MemberRole }
): ConversationDto {
  return {
    channelId: doc.roomKey,
    conversationId: doc._id.toString(),
    cid: `unagency:${doc.roomKey}`,
    name: doc.name,
    entityKind: doc.entityKind,
    entityId: doc.entityId,
    organizationId: doc.organizationId.toString(),
    projectId: doc.projectId?.toString(),
    brandId: doc.brandId?.toString(),
    briefId: doc.briefId?.toString(),
    executionId: doc.executionId,
    productPath: doc.productPath,
    createdByUserId: doc.createdByUserId?.toString(),
    unreadCount: member?.unreadCount ?? 0,
    lastMessagePreview: doc.lastMessagePreview,
    memberRole: member?.role,
  };
}

async function audit(input: {
  conversationId?: string;
  organizationId?: string;
  userId?: string;
  action: string;
  detail?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await ConversationAudit.create({
      conversationId: input.conversationId
        ? new mongoose.Types.ObjectId(input.conversationId)
        : undefined,
      organizationId: input.organizationId
        ? new mongoose.Types.ObjectId(input.organizationId)
        : undefined,
      userId: input.userId
        ? new mongoose.Types.ObjectId(input.userId)
        : undefined,
      action: input.action,
      detail: input.detail,
      meta: input.meta,
    });
  } catch {
    /* best-effort */
  }
}

export class CollaborationOsService {
  async provision(input: {
    entityKind: ConversationEntityKind;
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
    memberRoles?: Record<string, MemberRole>;
  }): Promise<{ channelId: string; conversationId: string; created: boolean }> {
    const roomKey = buildRoomKey(input.entityKind, input.entityId);
    const members = [
      ...new Set(
        [...input.memberUserIds, input.createdByUserId].map(String).filter(Boolean)
      ),
    ];

    let created = false;
    let convo = await Conversation.findOne({ roomKey });
    if (!convo) {
      created = true;
      convo = await Conversation.create({
        roomKey,
        entityKind: input.entityKind,
        entityId: input.entityId,
        organizationId: new mongoose.Types.ObjectId(input.organizationId),
        name: input.name,
        projectId: input.projectId
          ? new mongoose.Types.ObjectId(input.projectId)
          : undefined,
        brandId: input.brandId
          ? new mongoose.Types.ObjectId(input.brandId)
          : undefined,
        briefId: input.briefId
          ? new mongoose.Types.ObjectId(input.briefId)
          : undefined,
        executionId: input.executionId,
        campaignId: input.campaignId,
        productPath: input.productPath,
        createdByUserId: new mongoose.Types.ObjectId(input.createdByUserId),
      });
    } else if (input.productPath && !convo.productPath) {
      convo.productPath = input.productPath;
      await convo.save();
    }

    for (const uid of members) {
      await ConversationMember.findOneAndUpdate(
        {
          conversationId: convo._id,
          userId: new mongoose.Types.ObjectId(uid),
        },
        {
          $setOnInsert: {
            conversationId: convo._id,
            userId: new mongoose.Types.ObjectId(uid),
            organizationId: new mongoose.Types.ObjectId(input.organizationId),
            role: input.memberRoles?.[uid] || "member",
            unreadCount: 0,
            joinedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }

    if (input.entityKind === "service") {
      await this.syncServiceChannelOversight(
        convo._id.toString(),
        input.organizationId
      );
    }

    await audit({
      conversationId: convo._id.toString(),
      organizationId: input.organizationId,
      userId: input.createdByUserId,
      action: created ? "conversation.created" : "conversation.members_synced",
      detail: roomKey,
    });

    return {
      channelId: roomKey,
      conversationId: convo._id.toString(),
      created,
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

  async syncServiceChannelOversight(
    conversationId: string,
    organizationId: string
  ): Promise<void> {
    const oversightUserIds = await listOversightUserIds();
    if (!oversightUserIds.length) return;

    for (const uid of oversightUserIds) {
      await ConversationMember.findOneAndUpdate(
        {
          conversationId: new mongoose.Types.ObjectId(conversationId),
          userId: new mongoose.Types.ObjectId(uid),
        },
        {
          $setOnInsert: {
            conversationId: new mongoose.Types.ObjectId(conversationId),
            userId: new mongoose.Types.ObjectId(uid),
            organizationId: new mongoose.Types.ObjectId(organizationId),
            role: "viewer" as MemberRole,
            unreadCount: 0,
            joinedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
  }

  async backfillServiceChannelOversight(): Promise<number> {
    const convos = await Conversation.find({
      entityKind: "service",
      archived: { $ne: true },
    })
      .select("_id organizationId")
      .lean();
    for (const convo of convos) {
      await this.syncServiceChannelOversight(
        convo._id.toString(),
        convo.organizationId.toString()
      );
    }
    return convos.length;
  }

  async assertMembership(
    userId: string,
    channelIdOrConversationId: string
  ): Promise<{ conversation: IConversation; member: any }> {
    const convo = await this.resolveConversation(channelIdOrConversationId);
    if (!convo || convo.archived) {
      throw new ApiError("Conversation not found", 404);
    }
    const member = await ConversationMember.findOne({
      conversationId: convo._id,
      userId: new mongoose.Types.ObjectId(userId),
    });
    if (!member) {
      await audit({
        conversationId: convo._id.toString(),
        organizationId: convo.organizationId.toString(),
        userId,
        action: "cross_tenant_rejected",
        detail: "membership_denied",
      });
      throw new ApiError("Not a conversation member", 403);
    }
    return { conversation: convo, member };
  }

  async resolveConversation(
    channelIdOrConversationId: string
  ): Promise<IConversation | null> {
    if (mongoose.isValidObjectId(channelIdOrConversationId)) {
      const byId = await Conversation.findById(channelIdOrConversationId);
      if (byId) return byId;
    }
    return Conversation.findOne({ roomKey: channelIdOrConversationId });
  }

  async listConversationsForUser(userId: string): Promise<ConversationDto[]> {
    const memberships = await ConversationMember.find({
      userId: new mongoose.Types.ObjectId(userId),
    })
      .sort({ updatedAt: -1 })
      .limit(100);
    const ids = memberships.map((m) => m.conversationId);
    const convos = await Conversation.find({
      _id: { $in: ids },
      archived: { $ne: true },
    });
    const byId = new Map(convos.map((c) => [c._id.toString(), c]));
    const out: ConversationDto[] = [];
    for (const m of memberships) {
      const c = byId.get(m.conversationId.toString());
      if (!c) continue;
      out.push(
        toConversationDto(c, {
          unreadCount: m.unreadCount,
          role: m.role,
        })
      );
    }
    return out;
  }

  async listMessages(input: {
    userId: string;
    channelId: string;
    limit?: number;
    parentId?: string;
    afterSequence?: number;
  }): Promise<MessageDto[]> {
    const { conversation } = await this.assertMembership(
      input.userId,
      input.channelId
    );
    const filter: Record<string, unknown> = {
      conversationId: conversation._id,
      deletedAt: { $exists: false },
    };
    if (input.parentId) {
      filter.$or = [
        { parentMessageId: new mongoose.Types.ObjectId(input.parentId) },
        { _id: new mongoose.Types.ObjectId(input.parentId) },
      ];
    } else {
      filter.parentMessageId = { $exists: false };
    }
    if (input.afterSequence != null) {
      filter.sequence = { $gt: input.afterSequence };
    }
    const rows = await CollabMessage.find(filter)
      .sort({ sequence: 1 })
      .limit(Math.min(input.limit ?? 50, 100));
    return rows.map((r) => toMessageDto(r, conversation.roomKey));
  }

  async sendMessage(input: {
    userId: string;
    channelId: string;
    text: string;
    messageType?: CollabMessageType;
    parentId?: string;
    threadKind?: "discussion" | "approval" | "execution" | "creative_review";
    clientMessageId?: string;
    assetId?: string;
    artifactId?: string;
    executionId?: string;
    approvalId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<MessageDto> {
    const { conversation, member } = await this.assertMembership(
      input.userId,
      input.channelId
    );
    if (member.role === "viewer") {
      // Oversight is provisioned as viewer for read access, but Admin QC must be
      // able to post deliverables into the client ↔ CS service chat.
      const sender = await Users.findById(input.userId).select("role").lean();
      const senderRole = String(sender?.role || "")
        .toLowerCase()
        .trim();
      const isOversight = (OVERSIGHT_ROLES as readonly string[]).includes(
        senderRole
      );
      if (!isOversight) {
        throw new ApiError("Read-only conversation access", 403);
      }
    }

    if (input.clientMessageId) {
      const existing = await CollabMessage.findOne({
        conversationId: conversation._id,
        clientMessageId: input.clientMessageId,
      });
      if (existing) return toMessageDto(existing, conversation.roomKey);
    }

    const last = await CollabMessage.findOne({ conversationId: conversation._id })
      .sort({ sequence: -1 })
      .select("sequence");
    const sequence = (last?.sequence ?? 0) + 1;

    const doc = await CollabMessage.create({
      conversationId: conversation._id,
      organizationId: conversation.organizationId,
      senderUserId: new mongoose.Types.ObjectId(input.userId),
      messageType: input.messageType || "text",
      text: input.text,
      parentMessageId: input.parentId
        ? new mongoose.Types.ObjectId(input.parentId)
        : undefined,
      threadKind: input.threadKind,
      clientMessageId: input.clientMessageId,
      sequence,
      assetId: input.assetId
        ? new mongoose.Types.ObjectId(input.assetId)
        : undefined,
      artifactId: input.artifactId,
      executionId: input.executionId,
      approvalId: input.approvalId,
      metadata: input.metadata || {},
    });

    if (input.assetId) {
      await MessageAttachment.create({
        messageId: doc._id,
        conversationId: conversation._id,
        organizationId: conversation.organizationId,
        productAssetId: new mongoose.Types.ObjectId(input.assetId),
      });
    }

    if (input.parentId) {
      await Thread.findOneAndUpdate(
        { rootMessageId: new mongoose.Types.ObjectId(input.parentId) },
        {
          $setOnInsert: {
            conversationId: conversation._id,
            rootMessageId: new mongoose.Types.ObjectId(input.parentId),
            organizationId: conversation.organizationId,
            kind: input.threadKind || "discussion",
          },
          $inc: { replyCount: 1 },
          $set: { lastReplyAt: new Date() },
        },
        { upsert: true }
      );
    }

    // Mentions @userId
    const mentionMatches = input.text.match(/@([a-f0-9]{24})/gi) || [];
    for (const m of mentionMatches) {
      const uid = m.slice(1);
      if (!mongoose.isValidObjectId(uid)) continue;
      await Mention.create({
        conversationId: conversation._id,
        messageId: doc._id,
        mentionedUserId: new mongoose.Types.ObjectId(uid),
        organizationId: conversation.organizationId,
      });
    }

    conversation.lastMessageAt = new Date();
    conversation.lastMessagePreview = input.text.slice(0, 160);
    await conversation.save();

    await ConversationMember.updateMany(
      {
        conversationId: conversation._id,
        userId: { $ne: new mongoose.Types.ObjectId(input.userId) },
      },
      { $inc: { unreadCount: 1 } }
    );

    await ReadReceipt.findOneAndUpdate(
      {
        messageId: doc._id,
        userId: new mongoose.Types.ObjectId(input.userId),
      },
      {
        $set: {
          messageId: doc._id,
          conversationId: conversation._id,
          userId: new mongoose.Types.ObjectId(input.userId),
          status: "sent",
          at: new Date(),
        },
      },
      { upsert: true }
    );

    // Notify other members
    void this.notifyMembers({
      conversation,
      excludeUserId: input.userId,
      title: conversation.name,
      body: input.text.slice(0, 120),
      messageId: doc._id.toString(),
    });

    await audit({
      conversationId: conversation._id.toString(),
      organizationId: conversation.organizationId.toString(),
      userId: input.userId,
      action: "message.sent",
      detail: doc._id.toString(),
    });

    return toMessageDto(doc, conversation.roomKey);
  }

  async markRead(input: {
    userId: string;
    channelId: string;
    messageId: string;
  }): Promise<void> {
    const { conversation, member } = await this.assertMembership(
      input.userId,
      input.channelId
    );
    const msg = await CollabMessage.findOne({
      _id: input.messageId,
      conversationId: conversation._id,
    });
    if (!msg) throw new ApiError("Message not found", 404);

    await ReadReceipt.findOneAndUpdate(
      {
        messageId: msg._id,
        userId: new mongoose.Types.ObjectId(input.userId),
      },
      {
        $set: {
          messageId: msg._id,
          conversationId: conversation._id,
          userId: new mongoose.Types.ObjectId(input.userId),
          status: "read",
          at: new Date(),
        },
      },
      { upsert: true }
    );

    member.unreadCount = 0;
    member.lastReadAt = new Date();
    member.lastReadMessageId = msg._id;
    await member.save();
  }

  async markDelivered(input: {
    userId: string;
    channelId: string;
    messageId: string;
  }): Promise<void> {
    const { conversation } = await this.assertMembership(
      input.userId,
      input.channelId
    );
    await ReadReceipt.findOneAndUpdate(
      {
        messageId: new mongoose.Types.ObjectId(input.messageId),
        userId: new mongoose.Types.ObjectId(input.userId),
      },
      {
        $setOnInsert: {
          messageId: new mongoose.Types.ObjectId(input.messageId),
          conversationId: conversation._id,
          userId: new mongoose.Types.ObjectId(input.userId),
          status: "delivered",
          at: new Date(),
        },
        $set: {
          status: "delivered",
          at: new Date(),
        },
      },
      { upsert: true }
    );
  }

  async listMembers(input: {
    userId: string;
    channelId: string;
  }): Promise<
    Array<{
      userId: string;
      role: MemberRole;
      name?: string;
      email?: string;
      image?: string;
    }>
  > {
    const { conversation } = await this.assertMembership(
      input.userId,
      input.channelId
    );
    const members = await ConversationMember.find({
      conversationId: conversation._id,
    }).limit(100);
    const users = await Users.find({
      _id: { $in: members.map((m) => m.userId) },
    }).select("name email image");
    const byId = new Map(users.map((u) => [u._id.toString(), u]));
    return members.map((m) => {
      const user = byId.get(m.userId.toString());
      return {
        userId: m.userId.toString(),
        role: m.role,
        name: user?.name,
        email: user?.email,
        image: user?.image,
      };
    });
  }

  async addMembers(input: {
    actorUserId: string;
    channelId: string;
    memberUserIds: string[];
    roles?: Record<string, MemberRole>;
  }): Promise<void> {
    const { conversation } = await this.assertMembership(
      input.actorUserId,
      input.channelId
    );
    for (const uid of input.memberUserIds) {
      await ConversationMember.findOneAndUpdate(
        {
          conversationId: conversation._id,
          userId: new mongoose.Types.ObjectId(uid),
        },
        {
          $setOnInsert: {
            conversationId: conversation._id,
            userId: new mongoose.Types.ObjectId(uid),
            organizationId: conversation.organizationId,
            role: input.roles?.[uid] || "member",
            unreadCount: 0,
            joinedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
  }

  async removeMembers(input: {
    actorUserId: string;
    channelId: string;
    memberUserIds: string[];
  }): Promise<void> {
    const { conversation } = await this.assertMembership(
      input.actorUserId,
      input.channelId
    );
    await ConversationMember.deleteMany({
      conversationId: conversation._id,
      userId: {
        $in: input.memberUserIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
    });
  }

  private async notifyMembers(input: {
    conversation: IConversation;
    excludeUserId: string;
    title: string;
    body: string;
    messageId: string;
  }): Promise<void> {
    try {
      const members = await ConversationMember.find({
        conversationId: input.conversation._id,
        userId: { $ne: new mongoose.Types.ObjectId(input.excludeUserId) },
      }).limit(50);
      for (const m of members) {
        await Notifications.create({
          userId: m.userId,
          title: input.title,
          description: input.body,
          type: "COMMON",
          category: "chat",
          action: "message.open",
          actionText: "Open chat",
          symbol: "💬",
          id: `${input.conversation.roomKey}:${input.messageId}`,
        });
      }
    } catch {
      /* optional */
    }
  }
}

export const collaborationOsService = new CollaborationOsService();
