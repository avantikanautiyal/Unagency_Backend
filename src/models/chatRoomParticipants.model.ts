import mongoose, { Schema } from "mongoose";

export interface CRoomUser {
    _id: mongoose.Types.ObjectId;
    chatRoomId: mongoose.Types.ObjectId;
    organizationId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;

}

const ChatRoomUserSchema = new Schema<CRoomUser>(
    {
        _id: { type: Schema.Types.ObjectId, auto: true },
        chatRoomId: { type: Schema.Types.ObjectId, required: true, unique: true },
        userId: { type: Schema.Types.ObjectId, required: true, unique: true }
    },
    { collection: "chatRoomUsers", timestamps: true }
);

const ChatRoomUser = mongoose.model<CRoomUser>(
    "chatRoomUsers",
    ChatRoomUserSchema
);

export default ChatRoomUser;
