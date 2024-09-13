import mongoose, { Schema } from "mongoose";

export interface IStripeCustomer {
  _id: mongoose.Types.ObjectId;
  email: string;
  name: string;
  stripeCustomerId: string;
}

const CustomerSchema = new Schema<IStripeCustomer>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    email: { type: String, required: true, unique: true },
    name: { type: String },
    stripeCustomerId: { type: String, required: true },
  },
  { collection: "StripeCustomers", timestamps: true }
);

const StripeCustomers = mongoose.model<IStripeCustomer>(
  "StripeCustomers",
  CustomerSchema
);

export default StripeCustomers;
