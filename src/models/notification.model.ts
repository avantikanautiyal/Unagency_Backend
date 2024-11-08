import mongoose, { Schema } from "mongoose";
import { NotificationType } from "../background/utils/notification";

export interface INotification {
    _id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId,
    title: string;
    description: string;
    type: NotificationType;
}

const NotificationSchema = new Schema<INotification>(
    {
        _id: { type: Schema.Types.ObjectId, auto: true },
        userId: { type: Schema.Types.ObjectId, ref: "Users", required: true },
        title: { type: String, required: true },
        description: { type: String, required: true },
        type: { type: String, required: true },

    },
    { collection: "Notifications", timestamps: true }
);

const Notifications = mongoose.model<INotification>("Notifications", NotificationSchema);
export default Notifications;
