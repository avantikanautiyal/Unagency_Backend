/**
 * Compatibility shim — Provider Capability Matrix now lives under providers/.
 * M1.3 moved the matrix into the Providers bounded context.
 * Do not add new logic here.
 */

export {
  type IProviderCapabilityMatrix,
  type ProviderCapabilityProfile,
  type ProviderFeatureSupport,
  type ProviderFeatureName,
  ProviderCapabilityMatrix,
  deriveCapabilityProfile,
} from "../providers/capability-matrix";

import type { ProviderId } from "../shared/identifiers";
import { success } from "../shared/result";
import type { Result } from "../shared/result";
import {
  ProviderCapabilityMatrix,
  type IProviderCapabilityMatrix,
  type ProviderCapabilityProfile,
  type ProviderFeatureName,
  type ProviderFeatureSupport,
} from "../providers/capability-matrix";

/**
 * Async façade matching the pre-M1.3 interface shape.
 */
export class AsyncProviderCapabilityMatrix {
  constructor(private readonly matrix: IProviderCapabilityMatrix) {}

  async get(
    providerId: ProviderId
  ): Promise<Result<ProviderCapabilityProfile>> {
    return this.matrix.get(providerId);
  }

  async list(): Promise<Result<readonly ProviderCapabilityProfile[]>> {
    return success(this.matrix.list());
  }

  async findByFeature(
    feature: ProviderFeatureName
  ): Promise<Result<readonly ProviderId[]>> {
    return success(this.matrix.findByFeature(feature));
  }

  async findMatching(
    required: Partial<ProviderFeatureSupport>
  ): Promise<Result<readonly ProviderId[]>> {
    return success(this.matrix.findMatching(required));
  }
}

export interface IProviderCapabilityMatrixFactory {
  create(): IProviderCapabilityMatrix;
}

export class ProviderCapabilityMatrixFactory
  implements IProviderCapabilityMatrixFactory
{
  create(): IProviderCapabilityMatrix {
    return new ProviderCapabilityMatrix();
  }
}
