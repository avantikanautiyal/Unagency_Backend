/**
 * Canonical OS Execution Plan — Phase 4.
 * Distinct from M1.4 single-capability ExecutionPlan under intelligence/execution-planning.
 * This is the multi-task DAG plan for Phase 5 TaskGraphExecutor.
 */

export const OS_EXECUTION_PLAN_VERSION = "1.0.0" as const;
export const OS_PLANNER_VERSION = "phase4.deterministic.1" as const;

export type ExecutionPlanStatus =
  | "DRAFT"
  | "VALIDATING"
  | "VALID"
  | "BLOCKED"
  | "INVALID"
  | "APPROVED_FOR_EXECUTION";

export type ExecutionPlanType =
  | "single_task"
  | "multi_deliverable"
  | "campaign"
  | "blocked";

export type ExecutionTaskType =
  | "research"
  | "analysis"
  | "strategy"
  | "messaging"
  | "creative_direction"
  | "copy"
  | "image"
  | "video"
  | "website"
  | "landing_page"
  | "document"
  | "review"
  | "transformation"
  | "data_processing"
  | "social_content"
  | "advertisement"
  | "other";

export type ExecutionComplexity = "LOW" | "MEDIUM" | "HIGH";

export type ExecutionRiskCategory =
  | "none"
  | "financial_claims"
  | "medical_claims"
  | "legal_claims"
  | "high_impact"
  | "external_publishing"
  | "multi_step"
  | "missing_context";

export type PlanProvenanceSource =
  | "BRIEF"
  | "BRAND"
  | "KNOWLEDGE"
  | "SYSTEM_RULE"
  | "CAPABILITY_REGISTRY"
  | "OUTPUT_CONTRACT";

export interface ExecutionPlanAssumption {
  readonly statement: string;
  readonly source: PlanProvenanceSource;
  readonly confidence: number;
}

export interface ExecutionUnresolvedRequirement {
  readonly key: string;
  readonly reason: string;
  readonly severity: "required" | "recommended";
}

export interface ExecutionContextRequirements {
  readonly brief: boolean;
  readonly brandVoice?: boolean;
  readonly brandTone?: boolean;
  readonly brandVisualIdentity?: boolean;
  readonly brandPositioning?: boolean;
  readonly knowledgeProductFacts?: boolean;
  readonly knowledgePricing?: boolean;
  readonly knowledgeGeneral?: boolean;
}

export interface ExecutionTaskOutputRequirement {
  readonly type: string;
  readonly quantity?: number;
  readonly channels?: readonly string[];
  readonly requiredSections?: readonly string[];
  readonly outputContractId: string;
}

export interface ExecutionTaskDefinition {
  readonly taskId: string;
  readonly taskKey: string;
  readonly name: string;
  readonly type: ExecutionTaskType;
  readonly objective: string;
  readonly inputRequirements: readonly string[];
  readonly outputRequirements: ExecutionTaskOutputRequirement;
  readonly requiredCapabilities: readonly string[];
  readonly contextRequirements: ExecutionContextRequirements;
  /** Explicit dependency task IDs (not array order). */
  readonly dependencies: readonly string[];
  readonly constraints: readonly string[];
  readonly priority: "low" | "normal" | "high";
  readonly executionMode: "sync" | "async" | "either";
  readonly retryPolicyReference?: string;
  readonly risk: ExecutionRiskCategory;
  readonly provenance: readonly {
    readonly field: string;
    readonly value: string;
    readonly source: PlanProvenanceSource;
  }[];
}

export interface ExecutionPlanDependencyEdge {
  readonly fromTaskId: string;
  readonly toTaskId: string;
  readonly kind: "hard" | "soft";
}

export interface ExecutionPlan {
  readonly id: string;
  readonly version: typeof OS_EXECUTION_PLAN_VERSION;
  readonly planVersion: number;
  readonly plannerVersion: typeof OS_PLANNER_VERSION;
  readonly executionId: string;
  readonly organizationId: string;
  readonly objective: string;
  readonly planType: ExecutionPlanType;
  readonly tasks: readonly ExecutionTaskDefinition[];
  readonly dependencies: readonly ExecutionPlanDependencyEdge[];
  readonly outputs: readonly string[];
  readonly requiredCapabilities: readonly string[];
  readonly contextRequirements: ExecutionContextRequirements;
  readonly constraints: readonly string[];
  readonly assumptions: readonly ExecutionPlanAssumption[];
  readonly unresolvedRequirements: readonly ExecutionUnresolvedRequirement[];
  readonly estimatedComplexity: ExecutionComplexity;
  readonly risk: {
    readonly categories: readonly ExecutionRiskCategory[];
    readonly level: "low" | "medium" | "high";
  };
  readonly confidence: {
    readonly system: number;
  };
  readonly provenance: {
    readonly briefId?: string;
    readonly briefVersion?: string;
    readonly brandContextId?: string;
    readonly brandContextHash?: string;
    readonly knowledgeContextId?: string;
    readonly knowledgeContextHash?: string;
    readonly knowledgeVersion?: string;
    readonly entries: readonly {
      readonly field: string;
      readonly value: string;
      readonly source: PlanProvenanceSource;
    }[];
  };
  readonly createdAt: string;
  readonly status: ExecutionPlanStatus;
  readonly validationErrors?: readonly string[];
  readonly failureReason?: string;
}

export interface CreateExecutionPlanInput {
  readonly organizationId: string;
  readonly executionId: string;
  readonly requestId: string;
  readonly brief: import("../../brief/contracts/structured-brief").StructuredBrief;
  readonly brandContext?: import("../../brand/contracts/brand-context").BrandContext;
  readonly knowledgeContext?: import("../../knowledge/contracts/knowledge-context").KnowledgeContext;
  /** Trusted tenant only — never from untrusted content. */
  readonly rawPromptPreview?: string;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
  /** Force a new plan version even if cached (replan). */
  readonly forceReplan?: boolean;
  readonly replanReason?: string;
  readonly existingPlanVersion?: number;
}
