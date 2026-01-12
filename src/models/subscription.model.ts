import mongoose, { Schema } from "mongoose";

export interface ISubscription {
  _id: mongoose.Types.ObjectId;
  customerId: string; // Stripe customer ID
  subscriptionId: string; // Stripe subscription ID
  planId: string; // Plan associated with the subscription
  userId: string;
  status: string; // Subscription status ('active', 'canceled', etc.)
  current_start?: string | null;
  current_end?: string | null;

  cancelledByUser: boolean,
  cancelledAt: Date,
  razorpayCancelRequested: boolean,
  // currentPeriodStart: Date; // Subscription start
  // currentPeriodEnd: Date; // Subscription renewal/cancellation date
}

const SubscriptionSchema = new Schema<ISubscription>({
  _id: { type: Schema.Types.ObjectId, auto: true },
  customerId: { type: String }, // Razorpay customer ID
  userId: { type: String, required: true },
  subscriptionId: { type: String, required: true }, // Razorpay subscription ID
  planId: { type: String, required: true, ref: "Plans" }, // Plan associated with the subscription
  status: {
    type: String,
    required: true,
    // enum: ["active", "canceled", "pending", "incomplete", "incomplete_expired", "trialing", "past_due", "unpaid"],
  },
  current_start: { type: Object },
  current_end: { type: Object },
  cancelledByUser: { type: Boolean, default: false },
  cancelledAt: { type: Date },
  razorpayCancelRequested: { type: Boolean, default: false },


  // Subscription status ('active', 'canceled', etc.)
  // currentPeriodStart: { type: Date, required: true }, // Subscription start
  // currentPeriodEnd: { type: Date, required: true }, // Subscription renewal/cancellation date
});


const Subscriptions = mongoose.model<ISubscription>(
  "Subscriptions",
  SubscriptionSchema
);

export default Subscriptions;
