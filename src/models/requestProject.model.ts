import mongoose, { Schema } from "mongoose";

export interface IRequirement {
    _id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId; // client UserId
    category: mongoose.Types.ObjectId;
    title: string;
    description: string;
    deadline: Date;
    files: string[];
    status: string;
}

const RequirementSchema = new Schema<IRequirement>(
    {
        _id: { type: Schema.Types.ObjectId, auto: true },
        userId: { type: Schema.Types.ObjectId, ref: "Users", required: true },
        title: { type: String, required: true, unique: true },
        files: { type: [], default: [] },
        status: { type: String, default: "raised" }, // status true = raised , false = recived
        category: {
            type: Schema.Types.ObjectId,
            ref: "Categories",
            required: true,
        },
        description: { type: String, required: true },
        deadline: { type: Date, required: true },

    },
    { collection: "requirements", timestamps: true }
);

const Requirement = mongoose.model<IRequirement>("requirements", RequirementSchema);
export default Requirement;
