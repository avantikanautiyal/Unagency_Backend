import mongoose, { Schema } from "mongoose";

export interface IUser {
  _id: mongoose.Types.ObjectId;
  firebaseId: string;
  name: string;
  password?: string;
  relationship_manager?: mongoose.Types.ObjectId;
  role: "admin" | "customer" | "superadmin" | "resource" | "servicing";
  contact?: number;
  email: string;
  state?: string;
  country?: string;
  isVerified: boolean;
  image?: string;
  bio?: string;
  isActive: boolean;
  subscription?: {
    id: string;
    status: string;
  },
  fcmTokens?: [string];
  emailVerificationCode?: string;
  isfirstMessageSent?: boolean;
}

const UsersSchema = new Schema<IUser>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    firebaseId: { type: String, required: true },
    name: { type: String, required: true },
    image: { type: String },
    relationship_manager: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
    },
    bio: { type: String },
    role: { type: String, required: true },
    contact: { type: String, default: "" },
    email: { type: String, required: true },
    state: { type: String, default: "" },
    country: { type: String, default: "" },
    isVerified: { type: Boolean, required: true },
    isActive: { type: Boolean, default: true },
    subscription: { type: Object, default: {} },
    fcmTokens: {
      type: [String],
      default: []
    },
    emailVerificationCode: { type: String, default: "" },
    isfirstMessageSent: { type: Boolean, default: false },

  },
  { collection: "users", timestamps: true }
);

const Users = mongoose.model<IUser>("Users", UsersSchema);
export default Users;
