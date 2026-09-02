import { Schema, model, type Document } from "mongoose";

export type AdaptiveRollbackEvent = {
  readonly rollbackId: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly reason: string;
  readonly timestamp: string;
  readonly scope?: Readonly<Record<string, string | undefined>>;
  readonly metrics?: Readonly<Record<string, number | undefined>>;
};

export type EnterpriseAdaptiveRollbackDoc = Document & AdaptiveRollbackEvent;

const enterpriseAdaptiveRollbackSchema = new Schema(
  {
    rollbackId: { type: String, required: true, unique: true, index: true },
    policyId: { type: String, required: true, index: true },
    policyVersion: { type: String, required: true },
    reason: { type: String, required: true },
    timestamp: { type: String, required: true, index: true },
    scope: Schema.Types.Mixed,
    metrics: Schema.Types.Mixed,
  },
  { collection: "enterprise_adaptive_routing_rollbacks" },
);

export const EnterpriseAdaptiveRoutingRollback = model(
  "EnterpriseAdaptiveRoutingRollback",
  enterpriseAdaptiveRollbackSchema,
);
