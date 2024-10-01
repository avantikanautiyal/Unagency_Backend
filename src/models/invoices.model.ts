import mongoose, { Schema } from "mongoose";

export interface IInvoice {
  _id: mongoose.Types.ObjectId;
  invoiceId: string;
  subscriptionId: string;
  customerId: string;
  amountDue: number;
  amountPaid?: number;
  currency: string;
  status: "paid" | "failed" | "open" | "draft";
  failureMessage?: string;
  paymentDate?: Date;
  failedPaymentDate?: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    invoiceId: {
      type: String,
      required: true,
      unique: true, // Ensures the invoice is unique
    },
    subscriptionId: {
      type: String,
      required: true,
    },
    customerId: {
      type: String,
      required: true,
    },
    amountDue: {
      type: Number,
      required: true,
    },
    amountPaid: {
      type: Number,
    },
    currency: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["paid", "failed", "open", "draft"],
      required: true,
    },
    failureMessage: {
      type: String,
    },
    paymentDate: {
      type: Date,
    },
    failedPaymentDate: {
      type: Date,
    },
  },
  { collection: "invoices", timestamps: true }
);

const Invoices = mongoose.model<IInvoice>("Invoices", InvoiceSchema);
export default Invoices;
