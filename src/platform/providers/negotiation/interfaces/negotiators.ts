/**
 * Negotiator ports.
 *
 * Purpose: One narrow interface per negotiation concern (DI everywhere).
 * Responsibilities: Define the contract each negotiator honors.
 * Usage: Implemented in the respective subfolders; injected into the engine.
 * Future Extension: New negotiators plug in without engine changes.
 */

import type { Result } from "../../../core/result";
import type {
  CapabilityCompatibility,
  FeatureCompatibility,
  ModelCompatibility,
  ProviderCompatibility,
} from "../contracts/compatibility";
import type { NegotiationConstraint } from "../contracts/negotiation-constraint";
import type {
  BudgetEvaluation,
  IdentityEvaluation,
  PolicyEvaluation,
  QualityEvaluation,
  RegionalEvaluation,
} from "../contracts/evaluations";
import type { NegotiationContext } from "./context";

export interface ICapabilityNegotiator {
  negotiate(context: NegotiationContext): Result<CapabilityCompatibility>;
}

export interface IProviderNegotiator {
  negotiate(context: NegotiationContext): Result<ProviderCompatibility>;
}

export interface IModelNegotiator {
  negotiate(context: NegotiationContext): Result<ModelCompatibility>;
}

export interface IFeatureNegotiator {
  negotiate(
    context: NegotiationContext,
    model: ModelCompatibility
  ): Result<FeatureCompatibility>;
}

export interface IConstraintNegotiator {
  negotiate(
    context: NegotiationContext
  ): Result<readonly NegotiationConstraint[]>;
}

export interface IPolicyNegotiator {
  negotiate(context: NegotiationContext): Result<PolicyEvaluation>;
}

export interface IRegionalNegotiator {
  negotiate(context: NegotiationContext): Result<RegionalEvaluation>;
}

export interface IQualityNegotiator {
  negotiate(context: NegotiationContext): Result<QualityEvaluation>;
}

export interface IBudgetNegotiator {
  negotiate(context: NegotiationContext): Result<BudgetEvaluation>;
}

/**
 * Consults the Provider Identity Platform through its interface only.
 * Async because identity session creation is async.
 */
export interface IIdentityNegotiator {
  negotiate(context: NegotiationContext): Promise<Result<IdentityEvaluation>>;
}
