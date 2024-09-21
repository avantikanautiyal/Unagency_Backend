import mongoose, { Schema } from "mongoose";

export interface ITransaction {
  transactionId: string; // Stripe paymentIntent ID or Charge ID
  customerId: string; // Stripe customer ID
  sessionId?: string; // Reference to the Checkout Session
  amount: number; // Amount paid in cents
  currency: string; // Example: 'usd'
  status: string; // Payment status ('succeeded', 'failed', etc.)
  paymentMethod?: string; // Example: 'card', 'paypal'
  receiptUrl?: string; // Stripe receipt URL
}

const TransactionSchema = new Schema<ITransaction>({
  transactionId: { type: String, required: true }, // Stripe paymentIntent ID or Charge ID
  customerId: { type: String, required: true }, // Stripe customer ID
  sessionId: { type: String }, // Reference to the Checkout Session
  amount: { type: Number, required: true }, // Amount paid in cents
  currency: { type: String, required: true }, // Example: 'usd'
  status: { type: String, required: true }, // Payment status ('succeeded', 'failed', etc.)
  paymentMethod: { type: String }, // Example: 'card', 'paypal'
  receiptUrl: { type: String }, // Stripe receipt URL
});

const Transactions = mongoose.model<ITransaction>(
  "Transactions",
  TransactionSchema
);

export default Transactions;
