/**
 * Model negotiator.
 *
 * Purpose: Evaluate model availability and capabilities.
 * Responsibilities: Resolve the capability profile and derive ModelCompatibility.
 * Usage: Third stage of the negotiation pipeline.
 * Future Extension: Per-model profiles from a model registry.
 */

import { success, type Result } from "../../../core/result";
import type { IProviderCapabilityMatrix } from "../../capability-matrix/interfaces/provider-capability-matrix";
import { deriveModelCompatibility } from "../compatibility/derive-model-compatibility";
import type { ModelCompatibility } from "../contracts/compatibility";
import type { NegotiationContext } from "../interfaces/context";
import type { IModelNegotiator } from "../interfaces/negotiators";

export class ModelNegotiator implements IModelNegotiator {
  constructor(private readonly matrix: IProviderCapabilityMatrix) {}

  negotiate(context: NegotiationContext): Result<ModelCompatibility> {
    const reasons: string[] = [];
    const profileResult = this.matrix.get(context.providerId);
    const profile = profileResult.ok ? profileResult.value : undefined;
    const modelId =
      context.modelId ?? context.request.plan.providerSelection.modelId;

    return success(
      deriveModelCompatibility(context.providerId, modelId, profile, reasons)
    );
  }
}
