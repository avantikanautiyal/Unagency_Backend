/**
 * SDK engine + event publisher ports.
 *
 * Purpose: Public entry point for SDK execution.
 * Responsibilities: resolve wrapper, validate, dispatch, normalize, return result.
 * Usage: Adapters call the engine; engine delegates to wrappers.
 * Future Extension: Streaming execute entry point.
 */

import type { Result } from "../../../shared/result";
import type { SdkVendor } from "../contracts/enums";
import type { SdkExecutionResult } from "../contracts/health-result";
import type { SdkRequest } from "../contracts/request-response";
import type { SdkClientDescriptor } from "../contracts/descriptors";
import type { SdkHealth } from "../contracts/health-result";

export interface IProviderSdkEngine {
  execute(request: SdkRequest): Promise<Result<SdkExecutionResult>>;
  describe(vendor: SdkVendor): Result<SdkClientDescriptor>;
  health(vendor: SdkVendor): SdkHealth;
}

export interface ISdkEventPublisher {
  publishResult(result: SdkExecutionResult): Promise<void>;
}
