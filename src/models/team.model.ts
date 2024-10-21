import mongoose, { Schema } from "mongoose";

export interface ITeam {
  _id: mongoose.Types.ObjectId;
  Organization: mongoose.Types.ObjectId; // Reference to Organizations
  userId: mongoose.Types.ObjectId; // Reference to User
  role: "owner" | "member"; // e.g., Admin, Manager, Staff, etc.
  invitationStatus: "accepted" | "pending" | "rejected";
}

const TeamSchema = new Schema<ITeam>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    Organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organizations",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },
    invitationStatus: {
      type: String,
      default: "pending",
    },
    role: {
      type: String,
      required: true,
      enum: ["owner", "member"],
    },
  },
  { collection: "teams", timestamps: true }
);

const Teams = mongoose.model<ITeam>("Teams", TeamSchema);
export default Teams;
