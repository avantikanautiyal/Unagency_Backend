/**
 * Provider Negotiation Engine (platform facade).
 *
 * Purpose: Run the full negotiation pipeline and produce a NegotiatedExecution.
 * Responsibilities: Orchestrate every negotiator; compute decision/confidence;
 *   assemble the runtime-consumable output. NEVER executes providers.
 * Usage: The future orchestrator calls negotiate() before the Provider Runtime.
 * Future Extension: Parallel candidate evaluation, ranked alternatives.
 *
 * SUCCESS CRITERION: the output NegotiatedExecution encodes every execution
 * decision so the runtime needs to make none.
 */

import type { ProviderId } from "../../../core/identifiers";
import { failure, success, type Result } from "../../../core/result";
import type {
  RetryPolicy,
  RetryStrategy,
} from "../../runtime/contracts/retry-policy";
import type {
  CapabilityCompatibility,
  FeatureCompatibility,
  ModelCompatibility,
  ProviderCompatibility,
} from "../contracts/compatibility";
import type {
  NegotiationEvidence,
  NegotiationFailure,
  NegotiationWarning,
} from "../contracts/diagnostics";
import type { NegotiationStage } from "../contracts/enums";
import type {
  BudgetEvaluation,
  IdentityEvaluation,
  PolicyEvaluation,
  QualityEvaluation,
  RegionalEvaluation,
} from "../contracts/evaluations";
import type { ExecutionProfile } from "../contracts/execution-profile";
import type {
  FallbackCandidate,
  NegotiatedExecution,
} from "../contracts/negotiated-execution";
import type { NegotiationConstraint } from "../contracts/negotiation-constraint";
import type { NegotiationRequest } from "../contracts/negotiation-request";
import type {
  NegotiationProfile,
  NegotiationResult,
} from "../contracts/negotiation-result";
import { NegotiationError, NegotiationInputError } from "../errors";
import type { NegotiationContext } from "../interfaces/context";
import type { INegotiationEventPublisher } from "../interfaces/negotiation-engine";
import type { IProviderNegotiationEngine } from "../interfaces/negotiation-engine";
import type {
  IBudgetNegotiator,
  ICapabilityNegotiator,
  IConstraintNegotiator,
  IFeatureNegotiator,
  IIdentityNegotiator,
  IModelNegotiator,
  IPolicyNegotiator,
  IProviderNegotiator,
  IQualityNegotiator,
  IRegionalNegotiator,
} from "../interfaces/negotiators";
import { computeConfidence, decide } from "../negotiation/decision";

export interface NegotiationEngineDeps {
  readonly capability: ICapabilityNegotiator;
  readonly provider: IProviderNegotiator;
  readonly model: IModelNegotiator;
  readonly feature: IFeatureNegotiator;
  readonly constraint: IConstraintNegotiator;
  readonly policy: IPolicyNegotiator;
  readonly regional: IRegionalNegotiator;
  readonly quality: IQualityNegotiator;
  readonly budget: IBudgetNegotiator;
  readonly identity: IIdentityNegotiator;
  readonly profile: NegotiationProfile;
  readonly events?: INegotiationEventPublisher;
  readonly nowIso: () => string;
  readonly createId: (prefix: string) => string;
}

class Diagnostics {
  readonly failures: NegotiationFailure[] = [];
  readonly warnings: NegotiationWarning[] = [];
  readonly evidence: NegotiationEvidence[] = [];

  fail(
    stage: NegotiationStage,
    code: string,
    message: string,
    data?: Readonly<Record<string, unknown>>
  ): void {
    this.failures.push({ stage, code, message, data });
  }

  warn(
    stage: NegotiationStage,
    code: string,
    message: string,
    data?: Readonly<Record<string, unknown>>
  ): void {
    this.warnings.push({ stage, code, message, data });
  }

  note(
    stage: NegotiationStage,
    detail: string,
    data?: Readonly<Record<string, unknown>>
  ): void {
    this.evidence.push({ stage, detail, data });
  }
}

interface PipelineOutputs {
  readonly capability: CapabilityCompatibility;
  readonly provider: ProviderCompatibility;
  readonly model: ModelCompatibility;
  readonly constraints: readonly NegotiationConstraint[];
  readonly identity: IdentityEvaluation;
  readonly policy: PolicyEvaluation;
  readonly feature: FeatureCompatibility;
  readonly budget: BudgetEvaluation;
  readonly regional: RegionalEvaluation;
  readonly quality: QualityEvaluation;
}

export class ProviderNegotiationEngine implements IProviderNegotiationEngine {
  constructor(private readonly deps: NegotiationEngineDeps) {}

  async negotiate(
    request: NegotiationRequest
  ): Promise<Result<NegotiationResult>> {
    if (!request.plan) {
      return failure(new NegotiationInputError("Negotiation requires a plan"));
    }

    const negotiationId = this.deps.createId("neg");
    const primaryProviderId = request.plan.providerSelection.primaryProviderId;
    const context: NegotiationContext = {
      request,
      providerId: primaryProviderId,
      modelId: request.plan.providerSelection.modelId,
    };

    try {
      const diag = new Diagnostics();
      const outputs = await this.runPipeline(context, diag);

      const decision = decide(diag.failures, diag.warnings);
      const confidence = computeConfidence(diag.failures, diag.warnings);

      let negotiated: NegotiatedExecution | undefined;
      if (decision !== "rejected") {
        const fallbackCandidates = await this.evaluateFallbacks(request);
        negotiated = this.buildNegotiatedExecution(
          negotiationId,
          request,
          primaryProviderId,
          outputs,
          diag,
          confidence,
          fallbackCandidates
        );
      }

      const result: NegotiationResult = {
        negotiationId,
        decision,
        summary: {
          decision,
          confidence,
          warningCount: diag.warnings.length,
          failureCount: diag.failures.length,
          selectedProviderId: negotiated?.selectedProviderId,
          selectedModelId: negotiated?.selectedModelId,
          capabilityId: request.plan.capabilityId,
        },
        negotiated,
        failures: diag.failures,
        warnings: diag.warnings,
        evidence: diag.evidence,
        createdAt: this.deps.nowIso(),
      };

      if (this.deps.events) {
        await this.deps.events.publish(result);
      }

      return success(result);
    } catch (error) {
      return failure(
        new NegotiationError("Unexpected negotiation failure", { negotiationId }, error)
      );
    }
  }

  private async runPipeline(
    context: NegotiationContext,
    diag: Diagnostics
  ): Promise<PipelineOutputs> {
    // 1. Capability analysis.
    const capability = this.unwrapOrThrow(
      this.deps.capability.negotiate(context)
    );
    if (!capability.exists) {
      diag.fail("capability", "capability_not_found", "capability not found");
    } else {
      if (!capability.enabled) {
        diag.fail(
          "capability",
          "capability_disabled",
          capability.reasons.join("; ") || "capability not enabled"
        );
      }
      if (!capability.compatible) {
        diag.fail(
          "capability",
          "capability_incompatible",
          "capability incompatible with provider"
        );
      }
      if (capability.maturity === "experimental" || capability.maturity === "beta") {
        diag.warn(
          "capability",
          "capability_immature",
          `capability maturity is '${capability.maturity}'`
        );
      }
      diag.note("capability", `capability maturity '${capability.maturity}'`);
    }

    // 2. Provider analysis.
    const provider = this.unwrapOrThrow(this.deps.provider.negotiate(context));
    if (!provider.supported) {
      diag.fail("provider", "provider_unsupported", "provider not registered");
    } else {
      if (!provider.available) {
        diag.fail("provider", "provider_unavailable", provider.reasons.join("; "));
      }
      if (!provider.compatible) {
        diag.fail(
          "provider",
          "provider_incompatible",
          "provider does not support the capability"
        );
      }
      if (provider.restricted) {
        diag.fail("provider", "provider_restricted", provider.reasons.join("; "));
      }
      if (!provider.healthy) {
        if (this.deps.profile.requireHealthyProvider) {
          diag.fail("provider", "provider_unhealthy", "provider is not healthy");
        } else {
          diag.warn("provider", "provider_unhealthy", "provider is not healthy");
        }
      }
      if (provider.maturity === "deprecated") {
        diag.warn("provider", "provider_deprecated", "provider is deprecated");
      }
      diag.note("provider", `provider maturity '${provider.maturity}'`);
    }

    // 3. Model analysis.
    const model = this.unwrapOrThrow(this.deps.model.negotiate(context));
    if (!model.available) {
      diag.fail("model", "model_unavailable", model.reasons.join("; "));
    } else {
      diag.note(
        "model",
        `model '${model.modelId ?? "auto"}' available`,
        { contextWindow: model.contextWindow }
      );
    }

    // 4. Constraint analysis.
    const constraints = this.unwrapOrThrow(
      this.deps.constraint.negotiate(context)
    );
    for (const constraint of constraints) {
      if (constraint.kind === "timeout" && constraint.reason) {
        diag.warn("constraint", "timeout_capped", constraint.reason);
      }
      diag.note("constraint", `constraint '${constraint.kind}' negotiated`, {
        satisfied: constraint.satisfied,
      });
    }

    // 5. Identity validation (interface-only consultation).
    const identity = this.unwrapOrThrow(await this.deps.identity.negotiate(context));
    if (identity.validated) {
      diag.note("identity", `identity validated (trust '${identity.trustLevel}')`);
    } else if (this.deps.profile.requireIdentityValidation) {
      diag.fail("identity", "identity_unvalidated", identity.reasons.join("; "));
    } else if (identity.attempted) {
      // Configured but the credential was not authorized — surface a warning.
      diag.warn(
        "identity",
        "identity_unvalidated",
        identity.reasons.join("; ") || "identity not validated"
      );
    } else {
      // No identity engine wired and validation not required — informational.
      diag.note("identity", "identity validation skipped (no engine configured)");
    }

    // 6. Policy validation.
    const policy = this.unwrapOrThrow(this.deps.policy.negotiate(context));
    if (!policy.satisfied) {
      diag.fail("policy", "policy_denied", policy.reasons.join("; "));
    } else {
      diag.note("policy", `${policy.consultedPolicies.length} policies consulted`);
    }

    // 7. Feature negotiation.
    const feature = this.unwrapOrThrow(
      this.deps.feature.negotiate(context, model)
    );
    for (const rejected of feature.rejected) {
      diag.fail(
        "feature",
        "feature_unsupported",
        `feature '${rejected}' not supported`
      );
    }
    diag.note("feature", `${feature.negotiated.length} features negotiated`);

    // 8. Budget validation.
    const budget = this.unwrapOrThrow(this.deps.budget.negotiate(context));
    if (!budget.withinBudget) {
      diag.fail("budget", "budget_exceeded", budget.reasons.join("; "));
    } else {
      diag.note("budget", "within budget");
    }

    // 9. Regional validation.
    const regional = this.unwrapOrThrow(this.deps.regional.negotiate(context));
    if (!regional.allowed) {
      diag.fail("regional", "region_denied", regional.reasons.join("; "));
    } else {
      diag.note("regional", "region allowed");
    }

    // 10. Quality validation.
    const quality = this.unwrapOrThrow(this.deps.quality.negotiate(context));
    if (!quality.satisfied) {
      diag.fail("quality", "quality_unmet", quality.reasons.join("; "));
    } else {
      diag.note("quality", `risk level '${quality.riskLevel}'`);
    }

    return {
      capability,
      provider,
      model,
      constraints,
      identity,
      policy,
      feature,
      budget,
      regional,
      quality,
    };
  }

  private buildNegotiatedExecution(
    negotiationId: string,
    request: NegotiationRequest,
    providerId: ProviderId,
    outputs: PipelineOutputs,
    diag: Diagnostics,
    confidence: number,
    fallbackCandidates: readonly FallbackCandidate[]
  ): NegotiatedExecution {
    const plan = request.plan;
    const timeoutConstraint = outputs.constraints.find(
      (c) => c.kind === "timeout"
    );
    const negotiatedTimeoutMs =
      typeof timeoutConstraint?.negotiated === "number"
        ? timeoutConstraint.negotiated
        : plan.timeout.timeoutMs;

    const evaluationConstraint = outputs.constraints.find(
      (c) => c.kind === "evaluation"
    );

    const executionProfile: ExecutionProfile = {
      executionMode: plan.executionMode,
      priority: plan.priority,
      retryPolicy: this.toRetryPolicy(plan.retry),
      timeoutPolicy: { executionTimeoutMs: negotiatedTimeoutMs },
      streaming: outputs.feature.negotiated.includes("streaming"),
      humanReviewRequired: outputs.quality.humanReviewRequired,
      evaluationEnabled:
        evaluationConstraint?.negotiated === true || plan.evaluation.enabled,
    };

    return {
      negotiationId,
      capabilityId: plan.capabilityId,
      selectedProviderId: providerId,
      selectedModelId: outputs.model.modelId,
      executionProfile,
      negotiatedFeatures: outputs.feature.negotiated,
      rejectedFeatures: outputs.feature.rejected,
      negotiatedConstraints: outputs.constraints,
      negotiatedBudget: outputs.budget,
      regional: outputs.regional,
      quality: outputs.quality,
      fallbackCandidates,
      warnings: diag.warnings,
      confidence,
      evidence: diag.evidence,
      createdAt: this.deps.nowIso(),
    };
  }

  private async evaluateFallbacks(
    request: NegotiationRequest
  ): Promise<readonly FallbackCandidate[]> {
    const candidates: FallbackCandidate[] = [];
    for (const providerId of request.plan.providerSelection.fallbackProviderIds) {
      const context: NegotiationContext = {
        request,
        providerId,
        modelId: request.plan.providerSelection.modelId,
      };
      const providerResult = this.deps.provider.negotiate(context);
      const modelResult = this.deps.model.negotiate(context);
      if (!providerResult.ok || !modelResult.ok) {
        continue;
      }
      const provider = providerResult.value;
      const model = modelResult.value;
      const usable =
        provider.supported &&
        provider.available &&
        provider.compatible &&
        !provider.restricted &&
        model.available;
      if (!usable) {
        continue;
      }
      const local = new Diagnostics();
      if (!provider.healthy) {
        local.warn("provider", "provider_unhealthy", "fallback unhealthy");
      }
      if (provider.maturity === "deprecated") {
        local.warn("provider", "provider_deprecated", "fallback deprecated");
      }
      candidates.push({
        providerId,
        modelId: model.modelId,
        confidence: computeConfidence(local.failures, local.warnings),
        reason: provider.healthy ? "healthy fallback" : "degraded fallback",
      });
    }
    return candidates;
  }

  private toRetryPolicy(retry: NegotiationRequest["plan"]["retry"]): RetryPolicy {
    const strategy: RetryStrategy = retry.strategy;
    return {
      strategy,
      maxAttempts: retry.maxAttempts,
      baseDelayMs: retry.backoffMs,
    };
  }

  /**
   * Negotiators return success for business outcomes; a Result failure here is
   * an unexpected internal fault, converted to a rejection by the negotiate()
   * try/catch boundary.
   */
  private unwrapOrThrow<T>(result: Result<T>): T {
    if (!result.ok) {
      throw result.error;
    }
    return result.value;
  }
}
