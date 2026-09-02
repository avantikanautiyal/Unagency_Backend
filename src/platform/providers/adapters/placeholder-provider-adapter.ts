/**
 * Placeholder provider adapter.
 *
 * Purpose: Satisfy factory construction without vendor SDKs or HTTP.
 * Responsibilities: Return NOT_IMPLEMENTED for execute().
 * Usage: Default adapter from ProviderFactory in M1.3.
 * Future Extension: Replaced by vendor-specific adapters.
 */

import { NotImplementedError } from "../../core/errors";
import { failure } from "../../core/result";
import type { Result } from "../../core/result";
import {
  AbstractProviderAdapter,
  type ProviderAdapterContext,
  type ProviderAdapterRequest,
  type ProviderAdapterResponse,
} from "./provider-adapter";

export class PlaceholderProviderAdapter extends AbstractProviderAdapter {
  constructor(context: ProviderAdapterContext) {
    super(context);
  }

  async execute(
    _request: ProviderAdapterRequest
  ): Promise<Result<ProviderAdapterResponse>> {
    return failure(
      new NotImplementedError(
        "Provider adapter execution is reserved for a future milestone",
        { providerId: this.providerId }
      )
    );
  }
}
