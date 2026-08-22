/**
 * Execution Intelligence engine — deterministic planning from Brief+Brand+Knowledge.
 * Provider-agnostic. Never imports vendor SDKs. Does NOT execute tasks (Phase 5).
 */

import type { ICapabilityRegistry } from "../../../intelligence/capability-registry/interfaces/capability-registry";
import { asCapabilityId } from "../../../intelligence/shared/identifiers";
import {
  defaultOutputContractRegistry,
  type OutputContractRegistry,
} from "../../contracts/output-contract-registry";
import type { IOutputContractRegistry } from "../../contracts/layer-ports";
import {
  OS_EXECUTION_PLAN_VERSION,
  OS_PLANNER_VERSION,
  type CreateExecutionPlanInput,
  type ExecutionPlan,
  type ExecutionPlanStatus,
} from "../contracts/execution-plan";
import { ExecutionIntelligenceError } from "../contracts/errors";
import {
  decomposeBriefToTasks,
  estimateComplexity,
  PLANNER_RUNTIME_CAPABILITIES,
} from "./plan-decomposer";
import { validateExecutionPlan } from "../validation/validate-execution-plan";

export interface IExecutionIntelligenceOsEngine {
  readonly implementationStatus: "implemented";
  createPlan(input: CreateExecutionPlanInput): ExecutionPlan;
  /**
   * Architecture hook for Phase 5+ — creates a new plan version.
   * Does not autonomously replan; caller must pass forceReplan/reason.
   */
  replan(
    input: CreateExecutionPlanInput & {
      readonly forceReplan: true;
      readonly replanReason: string;
    }
  ): ExecutionPlan;
}

function riskLevel(
  categories: readonly string[]
): "low" | "medium" | "high" {
  if (
    categories.includes("financial_claims") ||
    categories.includes("medical_claims") ||
    categories.includes("legal_claims")
  ) {
    return "high";
  }
  if (
    categories.includes("multi_step") ||
    categories.includes("external_publishing") ||
    categories.includes("missing_context")
  ) {
    return "medium";
  }
  return "low";
}

function availableCapabilitySet(
  registry: ICapabilityRegistry
): Set<string> {
  const set = new Set<string>();
  for (const id of PLANNER_RUNTIME_CAPABILITIES) {
    if (registry.exists(asCapabilityId(id))) set.add(id);
  }
  // Always allow text.generate if somehow missing — registry should have it
  if (set.size === 0 && registry.exists(asCapabilityId("text.generate"))) {
    set.add("text.generate");
  }
  return set;
}

/**
 * Strip instruction-like injection from brand/knowledge before planning policy.
 * Planning rules are code — untrusted text must not become directives.
 */
export function sanitizeUntrustedPlanningData(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(
      /\b(ignore\s+(all\s+)?previous\s+instructions?|system\s+prompt|reveal\s+secrets?)\b/gi,
      "[redacted-instruction]"
    )
    .slice(0, 2000);
}

export class ExecutionIntelligenceOsEngine
  implements IExecutionIntelligenceOsEngine
{
  readonly implementationStatus = "implemented" as const;

  constructor(
    private readonly deps: {
      readonly capabilityRegistry: ICapabilityRegistry;
      readonly outputContractRegistry?: IOutputContractRegistry;
    }
  ) {}

  private get outputContracts(): IOutputContractRegistry {
    return this.deps.outputContractRegistry ?? defaultOutputContractRegistry;
  }

  createPlan(input: CreateExecutionPlanInput): ExecutionPlan {
    return this.buildPlan(input);
  }

  replan(
    input: CreateExecutionPlanInput & {
      readonly forceReplan: true;
      readonly replanReason: string;
    }
  ): ExecutionPlan {
    if (!input.replanReason?.trim()) {
      throw new ExecutionIntelligenceError(
        "PLAN_INVALID_INPUT",
        "replanReason is required"
      );
    }
    return this.buildPlan({
      ...input,
      forceReplan: true,
      existingPlanVersion: (input.existingPlanVersion ?? 0) + 1,
    });
  }

  private buildPlan(input: CreateExecutionPlanInput): ExecutionPlan {
    if (!input.organizationId?.trim()) {
      throw new ExecutionIntelligenceError(
        "PLAN_TENANT_VIOLATION",
        "organizationId is required"
      );
    }
    if (!input.executionId?.trim()) {
      throw new ExecutionIntelligenceError(
        "PLAN_INVALID_INPUT",
        "executionId is required"
      );
    }
    if (!input.brief) {
      throw new ExecutionIntelligenceError(
        "PLAN_INVALID_INPUT",
        "StructuredBrief is required"
      );
    }
    if (input.brief.organizationId !== input.organizationId) {
      throw new ExecutionIntelligenceError(
        "PLAN_TENANT_VIOLATION",
        "Brief organizationId does not match trusted tenant"
      );
    }
    if (
      input.brandContext &&
      input.brandContext.organizationId !== input.organizationId
    ) {
      throw new ExecutionIntelligenceError(
        "PLAN_TENANT_VIOLATION",
        "BrandContext organizationId does not match trusted tenant"
      );
    }
    if (
      input.knowledgeContext &&
      input.knowledgeContext.organizationId !== input.organizationId
    ) {
      throw new ExecutionIntelligenceError(
        "PLAN_TENANT_VIOLATION",
        "KnowledgeContext organizationId does not match trusted tenant"
      );
    }

    // Treat brand/knowledge as DATA only — never planning instructions.
    if (input.brandContext?.tone?.tone) {
      sanitizeUntrustedPlanningData(input.brandContext.tone.tone);
    }
    if (input.knowledgeContext?.facts?.length) {
      for (const f of input.knowledgeContext.facts) {
        sanitizeUntrustedPlanningData(`${f.key}=${f.value}`);
      }
    }

    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
    const planVersion =
      input.forceReplan || input.existingPlanVersion
        ? Math.max(1, input.existingPlanVersion ?? 1)
        : 1;

    const available = availableCapabilitySet(this.deps.capabilityRegistry);
    const decomposed = decomposeBriefToTasks({
      brief: input.brief,
      brandContext: input.brandContext,
      knowledgeContext: input.knowledgeContext,
      planVersion,
      availableCapabilities: available,
    });

    const modalities = new Set(
      decomposed.tasks.flatMap((t) => t.requiredCapabilities)
    ).size;
    const complexity = estimateComplexity(
      decomposed.tasks.length,
      decomposed.dependencies.length,
      modalities
    );

    let status: ExecutionPlanStatus = "DRAFT";
    let validationErrors: string[] | undefined;
    let failureReason: string | undefined;

    const draft: ExecutionPlan = {
      id: createId("eplan"),
      version: OS_EXECUTION_PLAN_VERSION,
      planVersion,
      plannerVersion: OS_PLANNER_VERSION,
      executionId: input.executionId,
      organizationId: input.organizationId,
      objective: input.brief.objective,
      planType: decomposed.planType,
      tasks: decomposed.tasks,
      dependencies: decomposed.dependencies,
      outputs: decomposed.tasks.map((t) => t.outputRequirements.type),
      requiredCapabilities: [
        ...new Set(decomposed.tasks.flatMap((t) => t.requiredCapabilities)),
      ],
      contextRequirements: decomposed.contextRequirements,
      constraints: input.brief.constraints.map((c) => `${c.key}=${c.value}`),
      assumptions: decomposed.assumptions,
      unresolvedRequirements: decomposed.unresolvedRequirements,
      estimatedComplexity: complexity,
      risk: {
        categories: decomposed.riskCategories,
        level: riskLevel(decomposed.riskCategories),
      },
      confidence: {
        system: decomposed.blocked
          ? 0.4
          : Math.min(0.95, 0.7 + input.brief.confidence.system * 0.2),
      },
      provenance: {
        briefId: input.brief.id,
        briefVersion: input.brief.version,
        brandContextId: input.brandContext?.id,
        brandContextHash: input.brandContext?.contextHash,
        knowledgeContextId: input.knowledgeContext?.id,
        knowledgeContextHash: input.knowledgeContext?.contextHash,
        knowledgeVersion: input.knowledgeContext?.knowledgeVersion,
        entries: [
          {
            field: "plannerVersion",
            value: OS_PLANNER_VERSION,
            source: "SYSTEM_RULE",
          },
          {
            field: "briefIntent",
            value: input.brief.intent.kind,
            source: "BRIEF",
          },
          ...(input.brandContext
            ? [
                {
                  field: "brandStatus",
                  value: input.brandContext.status,
                  source: "BRAND" as const,
                },
              ]
            : []),
          ...(input.knowledgeContext
            ? [
                {
                  field: "knowledgeStatus",
                  value: input.knowledgeContext.status,
                  source: "KNOWLEDGE" as const,
                },
              ]
            : []),
          ...(input.replanReason
            ? [
                {
                  field: "replanReason",
                  value: input.replanReason,
                  source: "SYSTEM_RULE" as const,
                },
              ]
            : []),
        ],
      },
      createdAt: nowIso(),
      status: "VALIDATING",
    };

    if (decomposed.blocked) {
      return {
        ...draft,
        status: "BLOCKED",
        failureReason: "PLAN_BLOCKED: unresolved required information",
        validationErrors: decomposed.unresolvedRequirements.map(
          (u) => `${u.key}: ${u.reason}`
        ),
      };
    }

    const validation = validateExecutionPlan(draft, {
      trustedOrganizationId: input.organizationId,
      capabilityRegistry: this.deps.capabilityRegistry,
      outputContractRegistry: this.outputContracts,
    });

    if (!validation.ok) {
      status = "INVALID";
      validationErrors = [...validation.errors];
      failureReason = validation.code ?? "PLAN_INVALID";
      return {
        ...draft,
        status,
        validationErrors,
        failureReason,
      };
    }

    // Structurally executable — not human approval
    return {
      ...draft,
      status: "APPROVED_FOR_EXECUTION",
    };
  }
}

export function createExecutionIntelligenceOsEngine(options: {
  readonly capabilityRegistry: ICapabilityRegistry;
  readonly outputContractRegistry?: IOutputContractRegistry | OutputContractRegistry;
}): IExecutionIntelligenceOsEngine {
  return new ExecutionIntelligenceOsEngine({
    capabilityRegistry: options.capabilityRegistry,
    outputContractRegistry: options.outputContractRegistry,
  });
}
