import mongoose, { Schema } from "mongoose";
import { NotificationType } from "../background/utils/notification";

type ActionType = "start" | "review" | "download" | "membership" | "message";
export interface INotification {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  type: NotificationType;
  isRead: boolean;
  action: string;
  actionText : string ;
  symbol : string;
}

const NotificationSchema = new Schema<INotification>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    userId: { type: Schema.Types.ObjectId, ref: "Users", required: true },
    isRead: { type: Boolean, default: false },
    symbol : {type : String} ,
    title: { type: String, required: true },
    description: { type: String, required: true },
    type: { type: String, required: true },
    action: { type: String },
    actionText :{type : String}
  },
  { collection: "Notifications", timestamps: true }
);

const Notifications = mongoose.model<INotification>(
  "Notifications",
  NotificationSchema
);
export default Notifications;
