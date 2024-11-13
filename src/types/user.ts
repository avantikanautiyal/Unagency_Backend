import { Request } from "express";

export interface UserType {
  userId: string;
  organization: object | null;
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
  relationship_manager?: string | object;
  staff?: string | object;
}

export type RequestUser = Request & {
  user?: UserType;
};
