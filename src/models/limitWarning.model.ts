import mongoose, { Schema } from "mongoose";

export interface ILimitWarning {
    org_id?: string;
    user_id: string;
    action: string;
    limitType: string;
    usage: number;
    max: number;
    plan: string;
    timestamp: Date;
}

const LimitWarningSchema = new Schema<ILimitWarning>(
    {
        org_id: { type: String },
        user_id: { type: String, required: true },
        action: { type: String, required: true }, // e.g., 'START_SERVICE', 'CREATE_BRIEF', 'INVITE_MEMBER'
        limitType: { type: String, required: true }, // e.g., 'max_concurrent_services'
        usage: { type: Number, required: true },
        max: { type: Number, required: true },
        plan: { type: String, required: true }, // Plan name or tag
        timestamp: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

const LimitWarning = mongoose.model<ILimitWarning>("LimitWarning", LimitWarningSchema);
export default LimitWarning;
