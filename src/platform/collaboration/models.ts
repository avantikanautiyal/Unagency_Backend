/**
 * M10.19 Collaboration OS — Mongo persistence (first-party realtime).
 * Attachments reference ProductAsset IDs — never duplicate bytes.
 */

import mongoose, { Schema, Document } from "mongoose";

export type ConversationEntityKind =
  | "organization"
  | "project"
  | "brand"
  | "campaign"
  | "brief"
  | "execution"
  | "support"
  | "team"
  | "client"
  | "knowledge_review"
  | "approval_review"
  | "rm"
  | "service"
  | "general";

export type CollabMessageType =
  | "text"
  | "image"
  | "video"
  | "voice"
  | "document"
  | "brand_asset"
  | "execution_artifact"
  | "knowledge_document"
  | "approval_card"
  | "execution_update"
  | "notification"
  | "ai_response"
  | "system";

export type PresenceStatus =
  | "online"
  | "offline"
  | "idle"
  | "typing"
  | "recording"
  | "streaming"
  | "executing";

export type MemberRole =
  | "owner"
  | "admin"
  | "manager"
  | "designer"
  | "developer"
  | "client"
  | "viewer"
  | "reviewer"
  | "approver"
  | "member";

export interface IConversation extends Document {
  roomKey: string;
  entityKind: ConversationEntityKind;
  entityId: string;
  organizationId: mongoose.Types.ObjectId;
  name: string;
  projectId?: mongoose.Types.ObjectId;
  brandId?: mongoose.Types.ObjectId;
  briefId?: mongoose.Types.ObjectId;
  executionId?: string;
  campaignId?: string;
  /** Stable product path for service-scoped rooms (client+brand+service). */
  productPath?: string;
  /** AI service chat working state — active deliverable, route selection, in-flight exec. */
  aiState?: Record<string, unknown>;
  createdByUserId: mongoose.Types.ObjectId;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  archived?: boolean;
}

const ConversationSchema = new Schema<IConversation>(
  {
    roomKey: { type: String, required: true, unique: true, index: true },
    entityKind: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true },
    projectId: { type: Schema.Types.ObjectId },
    brandId: { type: Schema.Types.ObjectId },
    briefId: { type: Schema.Types.ObjectId },
    executionId: { type: String },
    campaignId: { type: String },
    productPath: { type: String, index: true },
    aiState: { type: Schema.Types.Mixed },
    createdByUserId: { type: Schema.Types.ObjectId, required: true },
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "CollaborationConversations" }
);
ConversationSchema.index({ organizationId: 1, entityKind: 1, entityId: 1 });
ConversationSchema.index({ brandId: 1, productPath: 1, entityKind: 1 });
ConversationSchema.index({ createdByUserId: 1, entityKind: 1 });

export interface IConversationMember extends Document {
  conversationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  role: MemberRole;
  unreadCount: number;
  lastReadAt?: Date;
  lastReadMessageId?: mongoose.Types.ObjectId;
  muted?: boolean;
  joinedAt: Date;
}

const ConversationMemberSchema = new Schema<IConversationMember>(
  {
    conversationId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, default: "member" },
    unreadCount: { type: Number, default: 0 },
    lastReadAt: { type: Date },
    lastReadMessageId: { type: Schema.Types.ObjectId },
    muted: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "CollaborationMembers" }
);
ConversationMemberSchema.index(
  { conversationId: 1, userId: 1 },
  { unique: true }
);

export interface ICollabMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  senderUserId?: mongoose.Types.ObjectId;
  messageType: CollabMessageType;
  text: string;
  parentMessageId?: mongoose.Types.ObjectId;
  threadKind?: "discussion" | "approval" | "execution" | "creative_review";
  clientMessageId?: string;
  sequence: number;
  assetId?: mongoose.Types.ObjectId;
  artifactId?: string;
  executionId?: string;
  approvalId?: string;
  metadata?: Record<string, unknown>;
  deletedAt?: Date;
  editedAt?: Date;
}

const CollabMessageSchema = new Schema<ICollabMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    senderUserId: { type: Schema.Types.ObjectId, index: true },
    messageType: { type: String, required: true, default: "text" },
    text: { type: String, default: "" },
    parentMessageId: { type: Schema.Types.ObjectId, index: true },
    threadKind: { type: String },
    clientMessageId: { type: String, index: true },
    sequence: { type: Number, required: true },
    assetId: { type: Schema.Types.ObjectId },
    artifactId: { type: String },
    executionId: { type: String },
    approvalId: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
    deletedAt: { type: Date },
    editedAt: { type: Date },
  },
  { timestamps: true, collection: "CollaborationMessages" }
);
CollabMessageSchema.index({ conversationId: 1, sequence: 1 });
CollabMessageSchema.index({ organizationId: 1, text: "text" });
CollabMessageSchema.index(
  { conversationId: 1, clientMessageId: 1 },
  { unique: true, partialFilterExpression: { clientMessageId: { $type: "string" } } }
);

export interface IMessageAttachment extends Document {
  messageId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  productAssetId: mongoose.Types.ObjectId;
  kind?: string;
}

const MessageAttachmentSchema = new Schema<IMessageAttachment>(
  {
    messageId: { type: Schema.Types.ObjectId, required: true, index: true },
    conversationId: { type: Schema.Types.ObjectId, required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, required: true },
    productAssetId: { type: Schema.Types.ObjectId, required: true, ref: "MediaFile" },
    kind: { type: String },
  },
  { timestamps: true, collection: "CollaborationAttachments" }
);

export interface IThread extends Document {
  conversationId: mongoose.Types.ObjectId;
  rootMessageId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  kind: "discussion" | "approval" | "execution" | "creative_review";
  replyCount: number;
  lastReplyAt?: Date;
}

const ThreadSchema = new Schema<IThread>(
  {
    conversationId: { type: Schema.Types.ObjectId, required: true, index: true },
    rootMessageId: { type: Schema.Types.ObjectId, required: true, unique: true },
    organizationId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, default: "discussion" },
    replyCount: { type: Number, default: 0 },
    lastReplyAt: { type: Date },
  },
  { timestamps: true, collection: "CollaborationThreads" }
);

export interface IReaction extends Document {
  messageId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  emoji: string;
}

const ReactionSchema = new Schema<IReaction>(
  {
    messageId: { type: Schema.Types.ObjectId, required: true, index: true },
    conversationId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    emoji: { type: String, required: true },
  },
  { timestamps: true, collection: "CollaborationReactions" }
);
ReactionSchema.index({ messageId: 1, userId: 1, emoji: 1 }, { unique: true });

export interface IReadReceipt extends Document {
  messageId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  status: "sent" | "delivered" | "read";
  at: Date;
}

const ReadReceiptSchema = new Schema<IReadReceipt>(
  {
    messageId: { type: Schema.Types.ObjectId, required: true, index: true },
    conversationId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    status: { type: String, enum: ["sent", "delivered", "read"], default: "sent" },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "CollaborationReadReceipts" }
);
ReadReceiptSchema.index({ messageId: 1, userId: 1 }, { unique: true });

export interface IPinnedMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  messageId: mongoose.Types.ObjectId;
  pinnedByUserId: mongoose.Types.ObjectId;
}

const PinnedMessageSchema = new Schema<IPinnedMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, required: true, index: true },
    messageId: { type: Schema.Types.ObjectId, required: true },
    pinnedByUserId: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true, collection: "CollaborationPinnedMessages" }
);
PinnedMessageSchema.index({ conversationId: 1, messageId: 1 }, { unique: true });

export interface IMention extends Document {
  conversationId: mongoose.Types.ObjectId;
  messageId: mongoose.Types.ObjectId;
  mentionedUserId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
}

const MentionSchema = new Schema<IMention>(
  {
    conversationId: { type: Schema.Types.ObjectId, required: true, index: true },
    messageId: { type: Schema.Types.ObjectId, required: true },
    mentionedUserId: { type: Schema.Types.ObjectId, required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true, collection: "CollaborationMentions" }
);

export interface IConversationSettings extends Document {
  conversationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  notifications: "all" | "mentions" | "none";
  draftText?: string;
}

const ConversationSettingsSchema = new Schema<IConversationSettings>(
  {
    conversationId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    notifications: { type: String, default: "all" },
    draftText: { type: String },
  },
  { timestamps: true, collection: "CollaborationSettings" }
);
ConversationSettingsSchema.index({ conversationId: 1, userId: 1 }, { unique: true });

export interface IConversationAudit extends Document {
  conversationId?: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  action: string;
  detail?: string;
  meta?: Record<string, unknown>;
}

const ConversationAuditSchema = new Schema<IConversationAudit>(
  {
    conversationId: { type: Schema.Types.ObjectId, index: true },
    organizationId: { type: Schema.Types.ObjectId, index: true },
    userId: { type: Schema.Types.ObjectId, index: true },
    action: { type: String, required: true, index: true },
    detail: { type: String },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "CollaborationAudits" }
);

export const Conversation =
  mongoose.models.CollaborationConversation ||
  mongoose.model<IConversation>("CollaborationConversation", ConversationSchema);
export const ConversationMember =
  mongoose.models.CollaborationMember ||
  mongoose.model<IConversationMember>("CollaborationMember", ConversationMemberSchema);
export const CollabMessage =
  mongoose.models.CollaborationMessage ||
  mongoose.model<ICollabMessage>("CollaborationMessage", CollabMessageSchema);
export const MessageAttachment =
  mongoose.models.CollaborationAttachment ||
  mongoose.model<IMessageAttachment>("CollaborationAttachment", MessageAttachmentSchema);
export const Thread =
  mongoose.models.CollaborationThread ||
  mongoose.model<IThread>("CollaborationThread", ThreadSchema);
export const Reaction =
  mongoose.models.CollaborationReaction ||
  mongoose.model<IReaction>("CollaborationReaction", ReactionSchema);
export const ReadReceipt =
  mongoose.models.CollaborationReadReceipt ||
  mongoose.model<IReadReceipt>("CollaborationReadReceipt", ReadReceiptSchema);
export const PinnedMessage =
  mongoose.models.CollaborationPinnedMessage ||
  mongoose.model<IPinnedMessage>("CollaborationPinnedMessage", PinnedMessageSchema);
export const Mention =
  mongoose.models.CollaborationMention ||
  mongoose.model<IMention>("CollaborationMention", MentionSchema);
export const ConversationSettings =
  mongoose.models.CollaborationSettings ||
  mongoose.model<IConversationSettings>("CollaborationSettings", ConversationSettingsSchema);
export const ConversationAudit =
  mongoose.models.CollaborationAudit ||
  mongoose.model<IConversationAudit>("CollaborationAudit", ConversationAuditSchema);

export function buildRoomKey(kind: ConversationEntityKind, entityId: string): string {
  const safe = String(entityId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  return `${kind}_${safe}`.slice(0, 64);
}
