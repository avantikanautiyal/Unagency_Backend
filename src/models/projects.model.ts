import mongoose, { Schema } from "mongoose";

export interface IProject {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  category: mongoose.Types.ObjectId;
  title: string;
  description: string;
  clientTeam: mongoose.Types.ObjectId[] | string[];
  resource: mongoose.Types.ObjectId[] | string[];
  files: mongoose.Types.ObjectId[] | string[];
  startDate: Date;
  deadline: Date;
  status: string;
  idleNotificationSent?: boolean;
  /** AI Create Design origin metadata */
  origin?: string;
  executionId?: string;
  sourceRouteId?: string;
  artifactId?: string;
  brandId?: mongoose.Types.ObjectId;
  productPath?: string;
  /** Client creation mode: ai | human | hybrid */
  creationMode?: string;
  /** Last incomplete Create Design step — describePrompt | generating | routeSelection | assetReady | document | chat */
  resumeStep?: string;
  productService?: string;
  productSubtype?: string;
  productPlatform?: string;
  productFormat?: string;
  productCategory?: string;
  creativePrompt?: string;
}

const ProjectSchema = new Schema<IProject>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    userId: { type: Schema.Types.ObjectId, ref: "Users", required: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Organisations" },
    title: { type: String, required: true },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Categories",
      required: true,
    },
    description: { type: String, required: true },
    startDate: { type: Date, required: true },
    deadline: { type: Date, required: true },
    resource: {
      type: [Schema.Types.ObjectId],
      ref: "Staff",
      default: [],
    },
    clientTeam: {
      type: [Schema.Types.ObjectId],
      ref: "Teams",
      default: [],
    },
    files: {
      type: [Schema.Types.ObjectId],
      ref: "MediaFile",
      default: [],
    },
    status: {
      type: String,
      default: "planning",
      enum: [
        "planning",
        "initiated",
        "on-hold",
        "revision",
        "delivered",
        "approved",
        "closed",
      ],
    },
    idleNotificationSent: { type: Boolean, default: false },
    origin: { type: String, default: "studio" },
    executionId: { type: String, index: true },
    sourceRouteId: { type: String, index: true },
    artifactId: { type: String },
    brandId: { type: Schema.Types.ObjectId, ref: "Brands" },
    productPath: { type: String },
    creationMode: { type: String },
    resumeStep: { type: String },
    productService: { type: String },
    productSubtype: { type: String },
    productPlatform: { type: String },
    productFormat: { type: String },
    productCategory: { type: String },
    creativePrompt: { type: String },
  },
  { collection: "projects", timestamps: true }
);

ProjectSchema.index({ userId: 1, createdAt: -1 });
ProjectSchema.index(
  { userId: 1, executionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      executionId: { $type: "string", $gt: "" },
    },
  }
);

const Projects = mongoose.model<IProject>("Projects", ProjectSchema);
export default Projects;
