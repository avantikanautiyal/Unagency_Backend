import mongoose, { Schema } from "mongoose";

export interface IDiscount {
  name: string; // Name of the discount or offer
  discountType: string; // Example: 'percentage', 'fixed'
  discountValue: number; // The value of the discount (e.g., 10 for 10%)
  couponId?: string; // Optional: Stripe Coupon ID (if you're using Stripe coupons)
  promotionCodeId?: string; // Optional: Stripe Promotion Code ID (if using Stripe promotion codes)
  expirationDate?: Date; // Date when the coupon/offer expires
  usageLimit?: number; // Limit on how many times this discount can be used
  usedCount?: number; // Track how many times the coupon/offer has been used
}

const DiscountSchema = new Schema<IDiscount>({
  name: { type: String, required: true }, // Name of the discount or offer
  discountType: { type: String, required: true, enum: ["percentage", "fixed"] }, // Example: 'percentage', 'fixed'
  discountValue: { type: Number, required: true }, // The value of the discount (e.g., 10 for 10%)
  couponId: { type: String }, // Optional: Stripe Coupon ID (if you're using Stripe coupons)
  promotionCodeId: { type: String }, // Optional: Stripe Promotion Code ID (if using Stripe promotion codes)
  expirationDate: { type: Date }, // Date when the coupon/offer expires
  usageLimit: { type: Number, default: null }, // Limit on how many times this discount can be used
  usedCount: { type: Number, default: 0 }, // Track how many times the coupon/offer has been used
});

const Discounts = mongoose.model<IDiscount>("Discounts", DiscountSchema);

export default Discounts;
