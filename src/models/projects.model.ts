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
  startDate: Date;
  deadline: Date;
  status: string;
}

const ProjectSchema = new Schema<IProject>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    userId: { type: Schema.Types.ObjectId, ref: "Users", required: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Organisations" },
    title: { type: String, required: true, unique: true },
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
  },
  { collection: "projects", timestamps: true }
);

const Projects = mongoose.model<IProject>("Projects", ProjectSchema);
export default Projects;
