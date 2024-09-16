import mongoose, { Schema } from "mongoose";

export interface ISubscription {
  _id: mongoose.Types.ObjectId;
  customerId: string; // Stripe customer ID
  subscriptionId: string; // Stripe subscription ID
  planId: string; // Plan associated with the subscription
  status: string; // Subscription status ('active', 'canceled', etc.)
  currentPeriodStart: Date; // Subscription start
  currentPeriodEnd: Date; // Subscription renewal/cancellation date
}

const SubscriptionSchema = new Schema<ISubscription>({
  _id: { type: Schema.Types.ObjectId, auto: true },
  customerId: { type: String, required: true }, // Stripe customer ID
  subscriptionId: { type: String, required: true }, // Stripe subscription ID
  planId: { type: String, required: true }, // Plan associated with the subscription
  status: {
    type: String,
    required: true,
    enum: ["active", "canceled", "pending"],
  }, // Subscription status ('active', 'canceled', etc.)
  currentPeriodStart: { type: Date, required: true }, // Subscription start
  currentPeriodEnd: { type: Date, required: true }, // Subscription renewal/cancellation date
});

const Subscriptions = mongoose.model<ISubscription>(
  "Subscriptions",
  SubscriptionSchema
);

export default Subscriptions;
