import { Request } from "express";

export interface UserType {
  userId: string;
  firebaseId: string;
  role: string;
  contact?: number;
  name: string;
  state?: string;
  country?: string;
  isVerified: boolean;
  email?: string;
  customerId?: string;
  subscriptionId?: string;
}

export type RequestUser = Request & {
  user?: UserType;
};
