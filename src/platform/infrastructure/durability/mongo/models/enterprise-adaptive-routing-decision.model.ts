import { Schema, model, type Document } from "mongoose";
import type { AdaptiveRoutingDecision } from "../../../../providers/routing/performance/benchmark/adaptive/adaptive-routing-decision-contract";

export type EnterpriseAdaptiveRoutingDecisionDoc = Document & AdaptiveRoutingDecision;

const enterpriseAdaptiveRoutingDecisionSchema = new Schema(
  {
    decisionId: { type: String, required: true, unique: true, index: true },
    decisionVersion: { type: String, required: true },
    requestId: { type: String, required: true, index: true },
    executionId: { type: String, index: true, sparse: true },
    timestamp: { type: String, required: true, index: true },
    scope: Schema.Types.Mixed,
    actual: Schema.Types.Mixed,
    adaptive: Schema.Types.Mixed,
    decision: { type: String, required: true, index: true },
    reason: { type: String, required: true, index: true },
    evidence: Schema.Types.Mixed,
    provenance: Schema.Types.Mixed,
    rolloutBucket: Number,
    rolloutPercentage: Number,
    rolloutSelected: Boolean,
    routingMode: { type: String, required: true, index: true },
    correlationId: { type: String, index: true, sparse: true },
    telemetry: Schema.Types.Mixed,
  },
  { collection: "enterprise_adaptive_routing_decisions" },
);

enterpriseAdaptiveRoutingDecisionSchema.index({
  "scope.service": 1,
  decision: 1,
  timestamp: -1,
});

export const EnterpriseAdaptiveRoutingDecision = model(
  "EnterpriseAdaptiveRoutingDecision",
  enterpriseAdaptiveRoutingDecisionSchema,
);
