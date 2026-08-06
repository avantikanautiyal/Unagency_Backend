import mongoose, { Schema } from "mongoose";

/**
 * Mongo mirror / legacy room rows (M10.19).
 * First-party Collaboration OS conversations are SoT in CollaborationConversations.
 */

export interface CRoom {
  _id: mongoose.Types.ObjectId;
  cid: string;
  roomId: string;
  members: mongoose.Types.ObjectId[];
  project_id?: mongoose.Types.ObjectId;
  room_type?: string;
  organizationId?: mongoose.Types.ObjectId;
  entityKind?: string;
  entityId?: string;
  brandId?: mongoose.Types.ObjectId;
  briefId?: mongoose.Types.ObjectId;
  executionId?: string;
  name?: string;
}

const ChatRoomSchema = new Schema<CRoom>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    cid: { type: String, index: true },
    roomId: { type: String, index: true, unique: true, sparse: true },
    members: { type: [Schema.Types.ObjectId], ref: "users", index: true },
    project_id: { type: Schema.Types.ObjectId, ref: "Projects" },
    room_type: { type: String },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organizations", index: true },
    entityKind: { type: String, index: true },
    entityId: { type: String, index: true },
    brandId: { type: Schema.Types.ObjectId, ref: "Brands" },
    briefId: { type: Schema.Types.ObjectId, ref: "requirements" },
    executionId: { type: String },
    name: { type: String },
  },
  { collection: "chatRoom", timestamps: true }
);

ChatRoomSchema.index({ members: 1, updatedAt: -1 });
ChatRoomSchema.index({ organizationId: 1, entityKind: 1 });

const ChatRoom = mongoose.model<CRoom>("chatrooms", ChatRoomSchema);

export default ChatRoom;
