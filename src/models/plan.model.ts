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

interface IRazorpayPlan {
  _id: mongoose.Types.ObjectId;
  plan_id : string ;
  razorpayPlanItem: any;
}
const RazorpayPlanItemSchema: Schema<IRazorpayPlan> = new Schema(
  {
    razorpayPlanItem: { type: Schema.Types.Mixed, required: true },
    plan_id : {type : String, required: true , unique : true},
  },
  { timestamps: true }
);

export const PlansModel = mongoose.model<IRazorpayPlan>(
  "Plans",
  RazorpayPlanItemSchema
);
