import mongoose, { Schema } from "mongoose";

export interface IPayment {
  _id: mongoose.Types.ObjectId;
      razorpay_payment_id : string;
      razorpay_subscription_id : string;
      razorpay_signature : string;
      userId : mongoose.Types.ObjectId,
      status : string;
}

const PaymentSchema = new Schema<IPayment>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    razorpay_payment_id: { type: String, required: true },
    razorpay_subscription_id: { type: String, required: true , ref : "Subscriptions" },
    razorpay_signature: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "users" },
    status : {type : String}
  },
  { collection: "payments", timestamps: true }
);

const Payments = mongoose.model<IPayment>("Payments", PaymentSchema);
export default Payments;

