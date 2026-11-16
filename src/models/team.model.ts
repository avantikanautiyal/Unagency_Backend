import mongoose, { Schema } from "mongoose";

export interface ITeam {
  _id: mongoose.Types.ObjectId;
  Organization: mongoose.Types.ObjectId; // Reference to Organizations
  /** Unset while the invitee has no UNAGENCY account yet (invite by email). */
  userId?: mongoose.Types.ObjectId; // Reference to User
  /** Lower-cased email the invitation was sent to; claimed on first sign-in. */
  invitedEmail?: string;
  invitedBy?: mongoose.Types.ObjectId;
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
      required: false,
    },
    invitedEmail: { type: String, lowercase: true, trim: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
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

TeamSchema.index({ invitedEmail: 1, invitationStatus: 1 });

const Teams = mongoose.model<ITeam>("Teams", TeamSchema);
export default Teams;
