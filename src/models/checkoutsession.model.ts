import mongoose, { Schema } from "mongoose";

export interface ICheckoutSession {
  _id: mongoose.Types.ObjectId;
  sessionId: string;
  customerId: string;
  paymentStatus: string; // Example: 'paid', 'unpaid', 'pending'
  amountTotal: number; // Total amount in cents
  currency: string; // Example: 'usd'
  discountAmount?: number; // Optional: Amount of discount applied
  couponId?: string; // Optional: Stripe coupon ID
  promotionCodeId?: string; // Optional: Stripe promotion code ID
}

const CheckoutSessionSchema = new Schema<ICheckoutSession>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    sessionId: { type: String, required: true }, // Stripe session ID
    customerId: { type: String, required: true }, // Stripe customer ID
    paymentStatus: { type: String, required: true }, // Example: 'paid', 'unpaid', 'pending'
    amountTotal: { type: Number, required: true }, // Total amount in cents (after discounts)
    currency: { type: String, required: true }, // Example: 'usd'
    discountAmount: { type: Number, default: 0 }, // Amount of discount applied
    couponId: { type: String }, // Stripe coupon ID (if any)
    promotionCodeId: { type: String }, // Stripe promotion code ID (if any)
  },
  { collection: "checkout_sessions", timestamps: true }
);

const CheckoutSession = mongoose.model<ICheckoutSession>(
  "CheckoutSession",
  CheckoutSessionSchema
);

export default CheckoutSession;
