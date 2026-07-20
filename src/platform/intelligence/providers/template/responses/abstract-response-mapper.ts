/**
 * Abstract response mapper — subclass per provider.
 */

import type { Result } from "../../../shared/result";
import { success } from "../../../shared/result";
import type {
  TemplateCanonicalRequest,
  TemplateCanonicalResponse,
} from "../contracts/request-response";
import type { TemplateWirePayload } from "../contracts/wire";
import type { IProviderResponseMapper } from "../interfaces/provider-template";

export abstract class AbstractResponseMapper implements IProviderResponseMapper {
  toCanonicalResponse(
    request: TemplateCanonicalRequest,
    wire: TemplateWirePayload
  ): Result<TemplateCanonicalResponse> {
    return this.map(request, wire);
  }

  protected baseResponse(
    request: TemplateCanonicalRequest,
    output: Readonly<Record<string, unknown>>,
    wire?: TemplateWirePayload
  ): TemplateCanonicalResponse {
    return {
      requestId: request.requestId,
      providerId: request.providerId,
      modelId: request.modelId,
      output,
      wirePayload: wire,
      completedAt: new Date().toISOString(),
    };
  }

  protected abstract map(
    request: TemplateCanonicalRequest,
    wire: TemplateWirePayload
  ): Result<TemplateCanonicalResponse>;
}
