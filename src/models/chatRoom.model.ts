import mongoose, { Schema } from "mongoose";

export interface CRoom {
    _id: mongoose.Types.ObjectId;
    cid: string;
    roomId: string;
    members: mongoose.Types.ObjectId[];
    project_id: mongoose.Types.ObjectId;
    room_type: string;
}

const ChatRoomSchema = new Schema<CRoom>(
    {
        _id: { type: Schema.Types.ObjectId, auto: true },
        cid: { type: String },
        roomId: { type: String },
        members: { type: [Schema.Types.ObjectId], ref: "users" },
        project_id: { type: Schema.Types.ObjectId, ref: "Projects" },
        room_type: { Type: String },
        // members: { type: [], ref: "users" }
        // organizationId: { type: Schema.Types.ObjectId, ref: "organizations", unique: true },
        // userId: { type: Schema.Types.ObjectId, ref: "users", unique: true },
        // description: { type: String, default: "" }
    },
    { collection: "chatRoom", timestamps: true }
);

const ChatRoom = mongoose.model<CRoom>(
    "chatrooms",
    ChatRoomSchema
);

export default ChatRoom;
