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
  /** Client creation mode: ai | human | hybrid — admin queues show human/hybrid only */
  creationMode?: string;
  brandId?: mongoose.Types.ObjectId;
  productPath?: string;
}

const RequirementSchema = new Schema<IRequirement>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    userId: { type: Schema.Types.ObjectId, ref: "Users", required: true },
    title: { type: String, required: true },
    files: { type: [], default: [] },
    status: { type: String, default: "raised" }, // status true = raised , false = recived
    category: {
      type: Schema.Types.ObjectId,
      ref: "Categories",
      required: true,
    },
    description: { type: String, required: true },
    deadline: { type: Date, required: true },
    creationMode: { type: String },
    brandId: { type: Schema.Types.ObjectId, ref: "Brands" },
    productPath: { type: String },
  },
  { collection: "requirements", timestamps: true }
);

RequirementSchema.index({ userId: 1, brandId: 1, productPath: 1, creationMode: 1 });

const Requirement = mongoose.model<IRequirement>("requirements", RequirementSchema);
export default Requirement;
