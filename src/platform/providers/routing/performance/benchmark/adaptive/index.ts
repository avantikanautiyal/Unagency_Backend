/**
 * Step 12/13 — Controlled Adaptive Routing Activation + Production Hardening
 */

export {
  ADAPTIVE_ROUTING_DECISION_VERSION,
  type AdaptiveRoutingDecision,
  type AdaptiveRoutingDecisionKind,
  type AdaptiveRoutingDecisionReason,
  type AdaptiveRoutingDecisionContext,
  type AdaptiveRoutingDecisionQuery,
  type AdaptiveRoutingScope,
  type ProductionRoutingMetadata,
  type RoutingMode,
  type AdaptiveRoutingTelemetry,
} from "./adaptive-routing-decision-contract";

export {
  type RoutingPolicyLifecycle,
  type AdaptiveRoutingPolicy,
  type RoutingPolicyScope,
  DEFAULT_ROUTING_POLICY_GUARDRAILS,
} from "./routing-policy-contract";

export {
  InMemoryRoutingPolicyStore,
  defaultRoutingPolicyStore,
  type IRoutingPolicyStore,
} from "./routing-policy-store";

export {
  MongoRoutingPolicyStore,
} from "./mongo-routing-policy-store";

export {
  createRoutingPolicyService,
  defaultRoutingPolicyService,
  type RoutingPolicyService,
} from "./routing-policy-service";

export {
  deterministicRolloutBucket,
  isRolloutSelected,
} from "./adaptive-rollout";

export {
  selectMatchingPolicy,
  isPolicyExpired,
} from "./adaptive-scope-matcher";

export {
  resolveAdaptiveRoutingDecision,
  createAdaptiveRoutingDecisionService,
  defaultAdaptiveRoutingDecisionService,
  type AdaptiveRoutingDecisionServiceDeps,
} from "./adaptive-routing-decision-service";

export {
  InMemoryAdaptiveRoutingDecisionStore,
  defaultAdaptiveRoutingDecisionStore,
  type IAdaptiveRoutingDecisionStore,
} from "./adaptive-routing-decision-store";

export {
  MongoAdaptiveRoutingDecisionStore,
} from "./mongo-adaptive-routing-decision-store";

export {
  logAdaptiveRoutingEnabled,
  logAdaptiveRoutingDecision,
  logAdaptiveRoutingExecution,
  logAdaptiveMetric,
} from "./adaptive-routing-logger";

export {
  sliceAdaptiveVsStatic,
  detectAdaptiveRegression,
  pausePolicyOnRegression,
  DEFAULT_ADAPTIVE_ROLLBACK_THRESHOLDS,
  type AdaptivePerformanceSlice,
} from "./adaptive-routing-rollback";

export {
  InMemoryAdaptiveRollbackStore,
  MongoAdaptiveRollbackStore,
  defaultAdaptiveRollbackStore,
  type IAdaptiveRollbackStore,
} from "./adaptive-rollback-store";

export {
  createAdaptiveRoutingQueryService,
  defaultAdaptiveRoutingQueryService,
  type AdaptiveRoutingQueryService,
} from "./adaptive-routing-query-service";

export {
  applyAdaptiveRoutingToPrepass,
  type ApplyAdaptiveRoutingInput,
  type ApplyAdaptiveRoutingResult,
  type AdaptiveRoutingPrepassDeps,
} from "./apply-adaptive-routing-prepass";

export {
  verifyAdaptiveCandidateCapability,
  createAdaptiveCandidateExecutableChecker,
  type AdaptiveCapabilityContext,
  type AdaptiveCapabilityVerdict,
} from "./adaptive-candidate-capability";

export {
  validateAdaptivePolicy,
  validateActivePoliciesAtStartup,
  type PolicyValidationResult,
} from "./adaptive-policy-validator";

export {
  ADAPTIVE_PILOT_TEMPLATE,
  resolveAdaptiveRoutingSafety,
  adaptiveRoutingMustFailClosed,
  type AdaptiveRoutingSafetyState,
} from "./adaptive-routing-safety";

export {
  composeAdaptiveRoutingPlatform,
  bootstrapAdaptiveRoutingAtStartup,
  createAdaptiveRoutingPlatform,
  type AdaptiveRoutingPlatform,
  type CreateAdaptiveRoutingPlatformInput,
} from "./create-adaptive-routing-platform";

export {
  buildAdaptiveTelemetry,
  emitAdaptiveDecisionTelemetry,
  stampAdaptiveFailoverMetadata,
} from "./adaptive-routing-telemetry";

export {
  resolveAdaptiveExecutionOutcome,
  type AdaptiveExecutionOutcomeInput,
} from "./adaptive-execution-outcome";
