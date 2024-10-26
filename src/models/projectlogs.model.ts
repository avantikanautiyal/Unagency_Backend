import mongoose, { Schema } from "mongoose";

export interface IProjectLog {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  ActionType: string;
  ActionDate: Date;
}

const ProjectLogSchema = new Schema<IProjectLog>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    projectId: { type: Schema.Types.ObjectId, ref: "projects", required: true },
    ActionType: {
      type: String,
      required: true,
      enum: [
        "planning",
        "initiated",
        "delivered",
        "revision",
        "approved",
        "closed",
      ],
    },
    ActionDate: { type: Date, required: true },
  },
  { collection: "ProjectLogs", timestamps: true }
);
const ProjectLogs = mongoose.model<IProjectLog>(
  "ProjectLogs",
  ProjectLogSchema
);
export default ProjectLogs;
