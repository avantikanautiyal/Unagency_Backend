import mongoose, { Date, Schema } from "mongoose";

export interface ITasks {
  _id: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  assignedTo: mongoose.Types.ObjectId;
  assignedBy: mongoose.Types.ObjectId | string;
  deadline: Date;
  completionDate: Date;
  status:
  | "todo"
  | "progress"
  | "submitted"
  | "feedback"
  | "revision"
  | "approved";
}

const TaskSchema = new Schema<ITasks>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    project: { type: Schema.Types.ObjectId, ref: "Projects", auto: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: "Staff", required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: "Staff", required: true },
    priority: { type: String, default: "low", enum: ["low", "medium", "high"] },
    deadline: { type: Date, required: true },
    completionDate: { type: Date },
    status: {
      type: String,
      default: "todo",
      enum: [
        "todo",
        "progress",
        "submitted",
        "feedback",
        "revision",
        "approved",
      ],
    },
  },
  { collection: "tasks", timestamps: true }
);

const Tasks = mongoose.model<ITasks>("Tasks", TaskSchema);
export default Tasks;
