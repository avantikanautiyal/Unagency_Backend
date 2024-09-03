import mongoose, { Schema } from "mongoose";

export interface IUser {
  _id: mongoose.Types.ObjectId;
  firebaseId: string;
  name: string;
  role: "admin" | "customer" | "superadmin" | "resource" | "servicing";
  contact: number;
  email: string;
  state: string;
  country: string;
  isVerified: boolean;
}

const UsersSchema = new Schema<IUser>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    firebaseId: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, required: true },
    contact: { type: Number, default: 0 },
    email: { type: String, required: true },
    state: { type: String, default: "" },
    country: { type: String, default: "" },
    isVerified: { type: Boolean, required: true },
  },
  { collection: "users", timestamps: true }
);

const Users = mongoose.model<IUser>("Users", UsersSchema);
export default Users;
