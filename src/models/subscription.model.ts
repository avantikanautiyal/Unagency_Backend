import mongoose, { Schema } from "mongoose";
import type { PlanCode } from "../billing/plan-codes";

export interface ISubscription {
  _id: mongoose.Types.ObjectId;
  customerId: string;
  subscriptionId: string;
  planId: string;
  planCode?: PlanCode;
  userId: string;
  organizationId?: string;
  status: string;
  current_start?: number | string | null;
  current_end?: number | string | null;
  next_charge_at?: number | null;
  quantity?: number;
  total_count?: number;
  paid_count?: number;
  remaining_count?: number;
  cancelledByUser: boolean;
  cancelledAt?: Date;
  razorpayCancelRequested: boolean;
  renewalReminderSentAt?: Date;
  expiredNotificationSent?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    customerId: { type: String },
    userId: { type: String, required: true, index: true },
    organizationId: { type: String, index: true },
    subscriptionId: { type: String, required: true, unique: true },
    planId: { type: String, required: true, ref: "Plans" },
    planCode: { type: String, index: true },
    status: {
      type: String,
      required: true,
    },
    current_start: { type: Schema.Types.Mixed },
    current_end: { type: Schema.Types.Mixed },
    next_charge_at: { type: Number },
    quantity: { type: Number, default: 1 },
    total_count: { type: Number },
    paid_count: { type: Number },
    remaining_count: { type: Number },
    cancelledByUser: { type: Boolean, default: false },
    cancelledAt: { type: Date },
    razorpayCancelRequested: { type: Boolean, default: false },
    renewalReminderSentAt: { type: Date },
    expiredNotificationSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Subscriptions = mongoose.model<ISubscription>(
  "Subscriptions",
  SubscriptionSchema
);

export default Subscriptions;
