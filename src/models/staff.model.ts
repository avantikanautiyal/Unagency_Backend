import mongoose, { Schema } from "mongoose";

export interface IStaff {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  experience: number;
  specialization: object;
  minTaskCapacity: number;
  maxTaskCapacity: number;
  availability: boolean;
  designation: string;
  status: boolean;
}

const StaffSchema = new Schema<IStaff>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    userId: { type: Schema.Types.ObjectId, ref: "Users", required: true },
    experience: { type: Number, required: true },
    specialization: { type: Array, required: true },
    minTaskCapacity: { type: Number, default: 0 },
    maxTaskCapacity: { type: Number, default: 10 },
    availability: { type: Boolean, default: true },
    designation: {
      type: String,
    },
    status: { type: Boolean, default: true },
  },
  { collection: "staff", timestamps: true }
);

const Staff = mongoose.model<IStaff>("Staff", StaffSchema);
export default Staff;
