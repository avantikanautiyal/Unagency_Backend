import mongoose, { Schema } from "mongoose";

export interface IRazorpayPlanItem {
  id: string;
  entity: string;
  interval: number;
  period: string;
  item: {
    id: string;
    active: boolean;
    name: string;
    description: string;
    amount: number;
    unit_amount: number;
    currency: string;
    type: string;
    unit: string | null;
    tax_inclusive: boolean;
    hsn_code: string | null;
    sac_code: string | null;
    tax_rate: number | null;
    tax_id: string | null;
    tax_group_id: string | null;
    created_at: number;
    updated_at: number;
  };
}

type Points = {
  value: string;
  include: boolean;
};

interface IRazorpayPlan {
  _id: mongoose.Types.ObjectId;
  plan_id: string;
  razorpayPlanItem: any;
  points: [Points];
  occurance: "monthly" | "quarterly" | "yearly" | "trial";
  tag: "trial" | "bronze" | "silver" | "gold" | "platinum";
  group_line: string;
  // New Limit Fields
  max_concurrent_services: number;
  max_briefs: number;
  unlimited_briefs: boolean;
  max_additional_members: number;
  user_popup_on_limit: boolean;
}
const RazorpayPlanItemSchema: Schema<IRazorpayPlan> = new Schema(
  {
    razorpayPlanItem: { type: Schema.Types.Mixed, required: true },
    plan_id: { type: String, required: true, unique: true },
    points: { type: [], default: [] },
    occurance: {
      type: String,
      required: true,
      enum: ["monthly", "quarterly", "yearly", "days"],
    },
    tag: {
      type: String,
      required: true,
      enum: ["trial", "bronze", "silver", "gold", "platinum"],
    },
    // New Limit Fields
    max_concurrent_services: { type: Number, default: 1 },
    max_briefs: { type: Number, default: 0 }, // 0 or -1 indicates check unlimited_briefs flag, but logically mixed use. Let's rely on unlimited_briefs for boolean check
    unlimited_briefs: { type: Boolean, default: false },
    max_additional_members: { type: Number, default: 0 },
    user_popup_on_limit: { type: Boolean, default: false },

    group_line: { type: String },
  },
  { timestamps: true }
);

export const PlansModel = mongoose.model<IRazorpayPlan>(
  "Plans",
  RazorpayPlanItemSchema
);
