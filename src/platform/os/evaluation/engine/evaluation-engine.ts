/**
 * OS Evaluation Engine — runs registered evaluators; does NOT govern.
 */

import { EvaluationError } from "../contracts/errors";
import type {
  EvaluateOutputInput,
  EvaluationOutcome,
  EvaluationResult,
} from "../contracts/evaluation-result";
import { OS_EVALUATOR_RUNTIME_VERSION } from "../contracts/evaluation-result";
import {
  createDefaultEvaluatorRegistry,
  type EvaluatorRegistry,
} from "../registry/evaluator-registry";

export interface AggregateEvaluation {
  readonly organizationId: string;
  readonly executionId: string;
  readonly planId: string;
  readonly planVersion: number;
  readonly taskId?: string;
  readonly results: readonly EvaluationResult[];
  readonly worstOutcome: EvaluationOutcome;
  readonly aggregateScores: {
    readonly overallScore?: number;
    readonly qualityScore?: number;
    readonly specComplianceScore?: number;
    readonly brandComplianceScore?: number;
    readonly riskScore?: number;
  };
  readonly runtimeVersion: typeof OS_EVALUATOR_RUNTIME_VERSION;
  readonly evaluatedAt: string;
}

const OUTCOME_RANK: Record<EvaluationOutcome, number> = {
  PASS: 0,
  PASS_WITH_WARNINGS: 1,
  HUMAN_REVIEW_REQUIRED: 2,
  RETRY_REQUIRED: 3,
  REJECTED: 4,
  BLOCKED: 5,
};

function worstOutcome(results: readonly EvaluationResult[]): EvaluationOutcome {
  let worst: EvaluationOutcome = "PASS";
  for (const r of results) {
    if (OUTCOME_RANK[r.outcome] > OUTCOME_RANK[worst]) worst = r.outcome;
  }
  return worst;
}

export interface IOsEvaluationEngine {
  readonly implementationStatus: "implemented";
  evaluateOutput(
    input: EvaluateOutputInput,
    evaluatorIds?: readonly string[]
  ): AggregateEvaluation;
  evaluateExecution(input: {
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
    readonly nowIso?: () => string;
    readonly createId?: (prefix: string) => string;
  }): AggregateEvaluation;
}

export class OsEvaluationEngine implements IOsEvaluationEngine {
  readonly implementationStatus = "implemented" as const;

  constructor(private readonly registry: EvaluatorRegistry) {}

  evaluateOutput(
    input: EvaluateOutputInput,
    evaluatorIds?: readonly string[]
  ): AggregateEvaluation {
    if (!input.organizationId?.trim()) {
      throw new EvaluationError("EVAL_TENANT_VIOLATION", "organizationId required");
    }
    const ids = evaluatorIds?.length
      ? evaluatorIds
      : this.registry.list().map((e) => e.evaluatorId);

    const results = ids.map((id) => this.registry.get(id).evaluate(input));
    return this.aggregate(input, results);
  }

  evaluateExecution(input: {
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
    readonly nowIso?: () => string;
    readonly createId?: (prefix: string) => string;
  }): AggregateEvaluation {
    if (input.taskResults.some((t) => !t.preview?.trim())) {
      // Missing combined deliverable content
    }
    const combined = input.taskResults
      .map((t) => `[${t.taskKey}]\n${t.preview}`)
      .join("\n\n");

    return this.evaluateOutput({
      organizationId: input.organizationId,
      executionId: input.executionId,
      planId: input.planId,
      planVersion: input.planVersion,
      outputContractId: "output.copy",
      preview: combined || " ",
      objective: input.objective,
      briefObjective: input.objective,
      brandTone: input.brandTone,
      nowIso: input.nowIso,
      createId: input.createId,
    });
  }

  private aggregate(
    input: EvaluateOutputInput,
    results: EvaluationResult[]
  ): AggregateEvaluation {
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const specs = results
      .map((r) => r.scores.specComplianceScore)
      .filter((n): n is number => typeof n === "number");
    const brands = results
      .map((r) => r.scores.brandComplianceScore)
      .filter((n): n is number => typeof n === "number");
    const quals = results
      .map((r) => r.scores.qualityScore)
      .filter((n): n is number => typeof n === "number");
    const risks = results
      .map((r) => r.scores.riskScore)
      .filter((n): n is number => typeof n === "number");
    const overalls = results
      .map((r) => r.scores.overallScore)
      .filter((n): n is number => typeof n === "number");

    const avg = (xs: number[]) =>
      xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;

    return {
      organizationId: input.organizationId,
      executionId: input.executionId,
      planId: input.planId,
      planVersion: input.planVersion,
      taskId: input.taskId,
      results,
      worstOutcome: worstOutcome(results),
      aggregateScores: {
        overallScore: avg(overalls),
        qualityScore: avg(quals),
        specComplianceScore: avg(specs),
        brandComplianceScore: avg(brands),
        riskScore: risks.length ? Math.max(...risks) : undefined,
      },
      runtimeVersion: OS_EVALUATOR_RUNTIME_VERSION,
      evaluatedAt: nowIso(),
    };
  }
}

export function createOsEvaluationEngine(
  registry?: EvaluatorRegistry
): IOsEvaluationEngine {
  return new OsEvaluationEngine(registry ?? createDefaultEvaluatorRegistry());
}
