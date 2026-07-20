/**
 * Abstract provider SDK — subclass implements invoke only.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { Result } from "../../../shared/result";
import { failure } from "../../../shared/result";
import { createTemplateError } from "../contracts/errors";
import type { TemplateWirePayload } from "../contracts/wire";
import type { IProviderSdk } from "../interfaces/provider-template";

export abstract class AbstractProviderSdk implements IProviderSdk {
  constructor(readonly providerId: ProviderId) {}

  async invoke(wire: TemplateWirePayload): Promise<Result<TemplateWirePayload>> {
    if (!this.isConfigured()) {
      return failure(
        createTemplateError(
          "authentication",
          "SDK_NOT_CONFIGURED",
          "Provider SDK is not configured",
          false
        )
      );
    }
    return this.dispatch(wire);
  }

  protected isConfigured(): boolean {
    return true;
  }

  protected abstract dispatch(
    wire: TemplateWirePayload
  ): Promise<Result<TemplateWirePayload>>;
}
