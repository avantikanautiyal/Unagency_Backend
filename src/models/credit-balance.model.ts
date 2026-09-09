import mongoose, { Schema } from "mongoose";
import type { PlanCode } from "../billing/plan-codes";

export interface ICreditBalance {
  _id: mongoose.Types.ObjectId;
  userId: string;
  organizationId?: string;
  subscriptionId: string;
  planCode: PlanCode;
  planId: string;
  allocated: number;
  used: number;
  remaining: number;
  periodStart: Date;
  periodEnd: Date;
  /** Idempotency key for allocation (e.g. webhook event or period key) */
  allocationKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const CreditBalanceSchema = new Schema<ICreditBalance>(
  {
    userId: { type: String, required: true, index: true },
    organizationId: { type: String, index: true },
    subscriptionId: { type: String, required: true, index: true },
    planCode: { type: String, required: true },
    planId: { type: String, required: true },
    allocated: { type: Number, required: true, default: 0 },
    used: { type: Number, required: true, default: 0 },
    remaining: { type: Number, required: true, default: 0 },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    allocationKey: { type: String, required: true, unique: true },
  },
  { timestamps: true, collection: "credit_balances" }
);

CreditBalanceSchema.index({ userId: 1, subscriptionId: 1, periodStart: -1 });

export const CreditBalanceModel = mongoose.model<ICreditBalance>(
  "CreditBalances",
  CreditBalanceSchema
);

export interface ICreditLedgerEntry {
  _id: mongoose.Types.ObjectId;
  userId: string;
  subscriptionId: string;
  creditBalanceId: mongoose.Types.ObjectId;
  delta: number;
  reason: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const CreditLedgerSchema = new Schema<ICreditLedgerEntry>(
  {
    userId: { type: String, required: true, index: true },
    subscriptionId: { type: String, required: true },
    creditBalanceId: {
      type: Schema.Types.ObjectId,
      ref: "CreditBalances",
      required: true,
    },
    delta: { type: Number, required: true },
    reason: { type: String, required: true },
    idempotencyKey: { type: String, required: true, unique: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true, collection: "credit_ledger" }
);

export const CreditLedgerModel = mongoose.model<ICreditLedgerEntry>(
  "CreditLedger",
  CreditLedgerSchema
);
