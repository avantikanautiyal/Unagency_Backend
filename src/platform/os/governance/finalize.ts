/**
 * Phase 6 finalize — Evaluation → Governance → control signal for TaskGraph.
 */

import { createOsEvaluationEngine } from "../evaluation/engine/evaluation-engine";
import type { AggregateEvaluation } from "../evaluation/engine/evaluation-engine";
import type { IOsEvaluationEngine } from "../evaluation/engine/evaluation-engine";
import { createOsGovernanceEngine } from "./governance-engine";
import type {
  IOsGovernanceEngine,
  OsGovernanceDecision,
} from "./governance-engine";
import type { GovernancePolicy } from "./policy";
import {
  InMemoryHumanReviewStore,
  type HumanReviewRecord,
  type IHumanReviewStore,
} from "./human-review";
import { logOsExecutionEvent } from "../observability/execution-log";
import {
  InMemoryEvaluationLedger,
  type IEvaluationLedger,
} from "../evaluation/persistence/evaluation-ledger";
import {
  InMemoryGovernanceDecisionStore,
  type IGovernanceDecisionStore,
} from "./persistence/governance-decision-store";

export type GovernanceControlSignal =
  | "CONTINUE"
  | "RETRY"
  | "BLOCK"
  | "PAUSE_HUMAN_REVIEW"
  | "APPROVE"
  | "REJECT";

export interface FinalizeTaskGovernanceInput {
  readonly organizationId: string;
  readonly executionId: string;
  readonly planId: string;
  readonly planVersion: number;
  readonly taskId: string;
  readonly taskKey: string;
  readonly taskType?: string;
  readonly objective?: string;
  readonly outputContractId: string;
  readonly outputRefId?: string;
  readonly preview: string;
  readonly briefObjective?: string;
  readonly brandTone?: string;
  readonly brandVoice?: string;
  readonly brandAvoidTerms?: readonly string[];
  readonly brandPreferredTerms?: readonly string[];
  readonly prohibitedPatterns?: readonly string[];
  readonly requiredSections?: readonly string[];
  /** Track A Phase A3 — continuity-bound job. */
  readonly continuityBound?: boolean;
  readonly boundLogoAssetId?: string;
  readonly mediaOutputCount?: number;
  readonly capabilityId?: string;
  readonly isImageCapability?: boolean;
  readonly service?: string;
  readonly subtype?: string;
  readonly platform?: string;
  readonly format?: string;
  readonly industry?: string;
  readonly outputKind?: string;
  readonly mockupRole?: string;
  readonly expectedModalities?: readonly string[];
  readonly actualModality?: string;
  readonly expectedAspectRatio?: string;
  readonly actualAspectRatio?: string;
  readonly structuredData?: unknown;
  readonly mediaArtifactIds?: readonly string[];
  readonly buildSucceeded?: boolean;
  readonly buildOutput?: string;
  readonly runtimeErrors?: readonly string[];
  readonly policy?: GovernancePolicy;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}

export interface FinalizeExecutionGovernanceInput {
  readonly organizationId: string;
  readonly executionId: string;
  readonly planId: string;
  readonly planVersion: number;
  readonly objective: string;
  readonly taskResults: readonly {
    readonly taskId: string;
    readonly taskKey: string;
    readonly preview: string;
    readonly outputContractId: string;
  }[];
  readonly brandTone?: string;
  readonly brandVoice?: string;
  readonly brandAvoidTerms?: readonly string[];
  readonly brandPreferredTerms?: readonly string[];
  readonly prohibitedPatterns?: readonly string[];
  /** Track A Phase A3 — continuity-bound job. */
  readonly continuityBound?: boolean;
  readonly boundLogoAssetId?: string;
  readonly mediaOutputCount?: number;
  readonly capabilityId?: string;
  readonly isImageCapability?: boolean;
  readonly service?: string;
  readonly territory?: string;
  readonly subtype?: string;
  readonly platform?: string;
  readonly format?: string;
  readonly industry?: string;
  readonly outputKind?: string;
  readonly mockupRole?: string;
  readonly expectedModalities?: readonly string[];
  readonly actualModality?: string;
  readonly expectedAspectRatio?: string;
  readonly actualAspectRatio?: string;
  readonly structuredData?: unknown;
  readonly mediaArtifactIds?: readonly string[];
  readonly buildSucceeded?: boolean;
  readonly buildOutput?: string;
  readonly runtimeErrors?: readonly string[];
  readonly providerSuccess?: boolean;
  readonly policy?: GovernancePolicy;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}

export interface GovernanceFinalizeResult {
  readonly aggregate: AggregateEvaluation;
  readonly decision: OsGovernanceDecision;
  readonly signal: GovernanceControlSignal;
  readonly humanReview?: HumanReviewRecord;
}

function signalFromDecision(
  action: OsGovernanceDecision["action"]
): GovernanceControlSignal {
  switch (action) {
    case "RETRY":
      return "RETRY";
    case "BLOCK":
      return "BLOCK";
    case "REJECT":
      return "REJECT";
    case "HUMAN_REVIEW":
      return "PAUSE_HUMAN_REVIEW";
    case "APPROVE":
      return "APPROVE";
    case "CONTINUE":
    default:
      return "CONTINUE";
  }
}

export class GovernanceFinalizeService {
  private readonly evaluationEngine: IOsEvaluationEngine;
  private readonly governanceEngine: IOsGovernanceEngine;
  private readonly humanReviewStore: IHumanReviewStore;
  private readonly evaluationLedger: IEvaluationLedger;
  private readonly governanceDecisions: IGovernanceDecisionStore;
  /** Idempotency: finalized task key → result */
  private readonly finalizedTasks = new Map<string, GovernanceFinalizeResult>();
  private readonly finalizedExecutions = new Map<string, GovernanceFinalizeResult>();

  constructor(
    private readonly deps: {
      readonly evaluation?: IOsEvaluationEngine;
      readonly governance?: IOsGovernanceEngine;
      readonly humanReviews?: IHumanReviewStore;
      readonly evaluationLedger?: IEvaluationLedger;
      readonly governanceDecisions?: IGovernanceDecisionStore;
    } = {}
  ) {
    this.evaluationEngine = deps.evaluation ?? createOsEvaluationEngine();
    this.governanceEngine = deps.governance ?? createOsGovernanceEngine();
    this.humanReviewStore = deps.humanReviews ?? new InMemoryHumanReviewStore();
    this.evaluationLedger = deps.evaluationLedger ?? new InMemoryEvaluationLedger();
    this.governanceDecisions = deps.governanceDecisions ?? new InMemoryGovernanceDecisionStore();
  }

  getHumanReviewStore(): IHumanReviewStore {
    return this.humanReviewStore;
  }

  getEvaluationLedger(): IEvaluationLedger {
    return this.evaluationLedger;
  }

  getGovernanceDecisionStore(): IGovernanceDecisionStore {
    return this.governanceDecisions;
  }

  private get evaluation(): IOsEvaluationEngine {
    return this.evaluationEngine;
  }

  private get governance(): IOsGovernanceEngine {
    return this.governanceEngine;
  }

  private get humanReviews(): IHumanReviewStore {
    return this.humanReviewStore;
  }

  private taskKey(input: {
    organizationId: string;
    executionId: string;
    taskId: string;
    preview: string;
  }): string {
    return `${input.organizationId}|${input.executionId}|${input.taskId}|${input.preview.slice(0, 200)}`;
  }

  private execKey(input: {
    organizationId: string;
    executionId: string;
    planVersion: number;
  }): string {
    return `${input.organizationId}|${input.executionId}|v${input.planVersion}`;
  }

  finalizeTask(input: FinalizeTaskGovernanceInput): GovernanceFinalizeResult {
    const cacheKey = this.taskKey(input);
    const cached = this.finalizedTasks.get(cacheKey);
    if (cached) return cached;

    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
    // Prefer explicit input policy; else governance engine default; else create
    const policy = input.policy;

    logOsExecutionEvent("evaluation.started", {
      requestId: input.executionId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      taskId: input.taskId,
      status: "started",
      planId: input.planId,
      planVersion: input.planVersion,
    });

    const aggregate = this.evaluation.evaluateOutput({
      organizationId: input.organizationId,
      executionId: input.executionId,
      planId: input.planId,
      planVersion: input.planVersion,
      taskId: input.taskId,
      taskKey: input.taskKey,
      taskType: input.taskType,
      objective: input.objective,
      outputContractId: input.outputContractId,
      outputRefId: input.outputRefId,
      preview: input.preview,
      briefObjective: input.briefObjective,
      brandTone: input.brandTone,
      brandVoice: input.brandVoice,
      brandAvoidTerms: input.brandAvoidTerms,
      brandPreferredTerms: input.brandPreferredTerms,
      prohibitedPatterns: input.prohibitedPatterns,
      requiredSections: input.requiredSections,
      continuityBound: input.continuityBound,
      boundLogoAssetId: input.boundLogoAssetId,
      mediaOutputCount: input.mediaOutputCount,
      capabilityId: input.capabilityId,
      isImageCapability: input.isImageCapability,
      service: input.service,
      territory: input.territory,
      subtype: input.subtype,
      platform: input.platform,
      format: input.format,
      industry: input.industry,
      outputKind: input.outputKind,
      mockupRole: input.mockupRole,
      expectedModalities: input.expectedModalities,
      actualModality: input.actualModality,
      expectedAspectRatio: input.expectedAspectRatio,
      actualAspectRatio: input.actualAspectRatio,
      structuredData: input.structuredData,
      mediaArtifactIds: input.mediaArtifactIds,
      buildSucceeded: input.buildSucceeded,
      buildOutput: input.buildOutput,
      runtimeErrors: input.runtimeErrors,
      nowIso,
      createId,
    });

    logOsExecutionEvent("evaluation.completed", {
      requestId: input.executionId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      taskId: input.taskId,
      status: aggregate.worstOutcome,
      planId: input.planId,
    });

    const decision = this.governance.decideFromEvaluation({
      aggregate,
      policy,
      scope: "task",
      providerSuccess: true,
      nowIso,
      createId,
    });

    logOsExecutionEvent("governance.decided", {
      requestId: input.executionId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      taskId: input.taskId,
      status: decision.action,
      planId: input.planId,
      planVersion: input.planVersion,
    });

    let humanReview: HumanReviewRecord | undefined;
    const signal = signalFromDecision(decision.action);
    if (signal === "PAUSE_HUMAN_REVIEW") {
      humanReview = {
        reviewId: createId("hreview"),
        organizationId: input.organizationId,
        executionId: input.executionId,
        planId: input.planId,
        planVersion: input.planVersion,
        taskId: input.taskId,
        outputRefId: input.outputRefId,
        reason: decision.reason,
        policyId: decision.policyId,
        policyVersion: decision.policyVersion,
        evaluationIds: decision.evaluationIds,
        requestedAt: nowIso(),
        status: "PENDING",
      };
      // sync create — store is async but we fire-and-forget via then
      void this.humanReviews.create(humanReview);
      logOsExecutionEvent("human_review.requested", {
        requestId: input.executionId,
        executionId: input.executionId,
        organizationId: input.organizationId,
        taskId: input.taskId,
        status: "PENDING",
        planId: input.planId,
      });
    }

    const result = { aggregate, decision, signal, humanReview };
    this.finalizedTasks.set(cacheKey, result);
    this.persistLedgers(aggregate, decision, createId);
    return result;
  }

  finalizeExecution(
    input: FinalizeExecutionGovernanceInput
  ): GovernanceFinalizeResult {
    const cacheKey = this.execKey(input);
    const cached = this.finalizedExecutions.get(cacheKey);
    if (cached) return cached;

    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
    const policy = input.policy;

    const aggregate = this.evaluation.evaluateExecution({
      organizationId: input.organizationId,
      executionId: input.executionId,
      planId: input.planId,
      planVersion: input.planVersion,
      objective: input.objective,
      taskResults: input.taskResults,
      brandTone: input.brandTone,
      brandVoice: input.brandVoice,
      brandAvoidTerms: input.brandAvoidTerms,
      brandPreferredTerms: input.brandPreferredTerms,
      prohibitedPatterns: input.prohibitedPatterns,
      continuityBound: input.continuityBound,
      boundLogoAssetId: input.boundLogoAssetId,
      mediaOutputCount: input.mediaOutputCount,
      capabilityId: input.capabilityId,
      isImageCapability: input.isImageCapability,
      service: input.service,
      territory: input.territory,
      subtype: input.subtype,
      platform: input.platform,
      format: input.format,
      industry: input.industry,
      outputKind: input.outputKind,
      mockupRole: input.mockupRole,
      expectedModalities: input.expectedModalities,
      actualModality: input.actualModality,
      expectedAspectRatio: input.expectedAspectRatio,
      actualAspectRatio: input.actualAspectRatio,
      structuredData: input.structuredData,
      mediaArtifactIds: input.mediaArtifactIds,
      buildSucceeded: input.buildSucceeded,
      buildOutput: input.buildOutput,
      runtimeErrors: input.runtimeErrors,
      nowIso,
      createId,
    });

    const decision = this.governance.decideFromEvaluation({
      aggregate,
      policy,
      scope: "execution",
      providerSuccess: input.providerSuccess !== false,
      nowIso,
      createId,
    });

    logOsExecutionEvent("governance.execution_decided", {
      requestId: input.executionId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      status: decision.action,
      planId: input.planId,
      planVersion: input.planVersion,
    });

    let humanReview: HumanReviewRecord | undefined;
    const signal = signalFromDecision(decision.action);
    if (signal === "PAUSE_HUMAN_REVIEW") {
      humanReview = {
        reviewId: createId("hreview"),
        organizationId: input.organizationId,
        executionId: input.executionId,
        planId: input.planId,
        planVersion: input.planVersion,
        reason: decision.reason,
        policyId: decision.policyId,
        policyVersion: decision.policyVersion,
        evaluationIds: decision.evaluationIds,
        requestedAt: nowIso(),
        status: "PENDING",
      };
      void this.humanReviews.create(humanReview);
    }

    const result = { aggregate, decision, signal, humanReview };
    this.finalizedExecutions.set(cacheKey, result);
    this.persistLedgers(aggregate, decision, createId);
    return result;
  }

  private persistLedgers(
    aggregate: AggregateEvaluation,
    decision: OsGovernanceDecision,
    createId: (prefix: string) => string
  ): void {
    const recordId = createId("evalrec");
    void this.evaluationLedger.append({
      recordId,
      organizationId: aggregate.organizationId,
      executionId: aggregate.executionId,
      planId: aggregate.planId,
      planVersion: aggregate.planVersion,
      taskId: aggregate.taskId,
      results: aggregate.results,
      worstOutcome: aggregate.worstOutcome,
      aggregateScores: aggregate.aggregateScores,
      evaluatedAt: aggregate.evaluatedAt,
      runtimeVersion: aggregate.runtimeVersion,
    });
    void this.governanceDecisions.append(decision);
  }

  /** Clear idempotency cache for a task (e.g. after REQUEST_CHANGES). */
  invalidateTaskFinalization(input: {
    organizationId: string;
    executionId: string;
    taskId: string;
  }): void {
    for (const key of [...this.finalizedTasks.keys()]) {
      if (
        key.startsWith(
          `${input.organizationId}|${input.executionId}|${input.taskId}|`
        )
      ) {
        this.finalizedTasks.delete(key);
      }
    }
    this.finalizedExecutions.delete(
      `${input.organizationId}|${input.executionId}|`
    );
    for (const key of [...this.finalizedExecutions.keys()]) {
      if (key.startsWith(`${input.organizationId}|${input.executionId}|`)) {
        this.finalizedExecutions.delete(key);
      }
    }
  }
}

export function createGovernanceFinalizeService(deps?: {
  readonly evaluation?: IOsEvaluationEngine;
  readonly governance?: IOsGovernanceEngine;
  readonly humanReviews?: IHumanReviewStore;
  readonly evaluationLedger?: IEvaluationLedger;
  readonly governanceDecisions?: IGovernanceDecisionStore;
}): GovernanceFinalizeService {
  return new GovernanceFinalizeService(deps);
}
