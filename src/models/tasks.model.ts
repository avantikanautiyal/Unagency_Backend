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
  | "admin_qc"
  | "client_review"
  | "feedback"
  | "revision"
  | "approved"
  | "completed";

  files: mongoose.Types.ObjectId[];
  /** CS notes for the designer (Drafts tab) — visible on resource portal. */
  csFeedback?: string;
  deadlineNotificationSent?: boolean;
  overdueNotificationSent?: boolean;
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
    csFeedback: { type: String, default: "" },
    files: {
      type: [Schema.Types.ObjectId],
      ref: "MediaFile",
      default: []
    },
    status: {
      type: String,
      default: "todo",
      enum: [
        "todo",
        "progress",
        "submitted",
        "admin_qc",
        "client_review",
        "feedback",
        "revision",
        "approved",
        "completed",
      ],
    },
    deadlineNotificationSent: { type: Boolean, default: false },
    overdueNotificationSent: { type: Boolean, default: false },
  },
  { collection: "tasks", timestamps: true }
);

const Tasks = mongoose.model<ITasks>("Tasks", TaskSchema);
export default Tasks;
