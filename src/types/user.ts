import mongoose from "mongoose";
import { Request } from "express";

export interface UserType {
  userId: mongoose.Types.ObjectId | string;
  firebaseId: string;
  role: string;
  contact: number;
  name: string;
  state: string;
  country: string;
  isVerified: boolean;
  email: string;
}

export type RequestUser = Request & {
  user?: UserType;
};
