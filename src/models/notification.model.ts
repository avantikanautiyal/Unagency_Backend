import mongoose, { Schema } from "mongoose";
import { NotificationType } from "../background/utils/notification";

export interface INotificationAction {
  text: string;
  action: string;
}

export interface INotification {
  _id: mongoose.Types.ObjectId;
  id: string;
  userId: mongoose.Types.ObjectId;
  eventKey?: string;
  title: string;
  description: string;
  type: NotificationType;
  notificationType?: string;
  userState?: string;
  tone?: string;
  conversionOpportunity?: string;
  isRead: boolean;
  action: string;
  actionText: string;
  secondaryAction?: INotificationAction;
  symbol: string;
  archived?: boolean;
  category?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
  channels?: string[];
}

const NotificationActionSchema = new Schema<INotificationAction>(
  {
    text: { type: String, required: true },
    action: { type: String, required: true },
  },
  { _id: false }
);

const NotificationSchema = new Schema<INotification>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    userId: { type: Schema.Types.ObjectId, ref: "Users", required: true },
    eventKey: { type: String, index: true },
    isRead: { type: Boolean, default: false },
    id: { type: String },
    symbol: { type: String },
    title: { type: String, required: true },
    description: { type: String, required: true },
    type: { type: String, required: true },
    notificationType: { type: String },
    userState: { type: String },
    tone: { type: String },
    conversionOpportunity: { type: String },
    action: { type: String },
    actionText: { type: String },
    secondaryAction: { type: NotificationActionSchema },
    archived: { type: Boolean, default: false, index: true },
    category: { type: String, default: "general", index: true },
    entityType: { type: String },
    entityId: { type: String },
    metadata: { type: Schema.Types.Mixed },
    dedupeKey: { type: String, unique: true, sparse: true },
    channels: [{ type: String }],
  },
  { collection: "Notifications", timestamps: true }
);

const Notifications = mongoose.model<INotification>(
  "Notifications",
  NotificationSchema
);
export default Notifications;
