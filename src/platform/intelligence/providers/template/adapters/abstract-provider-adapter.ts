/**
 * Abstract provider adapter — wires mappers and SDK.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { Result } from "../../../shared/result";
import type { TemplateCanonicalRequest, TemplateCanonicalResponse } from "../contracts/request-response";
import type { IProviderAdapter, IProviderRequestMapper, IProviderResponseMapper, IProviderSdk } from "../interfaces/provider-template";

export abstract class AbstractProviderAdapter implements IProviderAdapter {
  constructor(
    readonly providerId: ProviderId,
    protected readonly requestMapper: IProviderRequestMapper,
    protected readonly responseMapper: IProviderResponseMapper,
    protected readonly sdk: IProviderSdk
  ) {}

  async translate(
    request: TemplateCanonicalRequest
  ): Promise<Result<TemplateCanonicalResponse>> {
    const wire = this.requestMapper.toWireRequest(request);
    if (!wire.ok) return wire;

    const raw = await this.sdk.invoke(wire.value);
    if (!raw.ok) return raw;

    return this.responseMapper.toCanonicalResponse(request, raw.value);
  }
}
