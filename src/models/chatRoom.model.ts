import mongoose, { Schema } from "mongoose";

export interface CRoom {
    _id: mongoose.Types.ObjectId;
    chatRoomId: string;
    organizationId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    name: string;
    isPrivate: boolean;
    description: string;
}

const ChatRoomSchema = new Schema<CRoom>(
    {
        _id: { type: Schema.Types.ObjectId, auto: true },
        chatRoomId: { type: String, required: true },
        name: { type: String, default: "" },
        isPrivate: { type: Boolean, default: true },
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
