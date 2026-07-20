/**
 * Abstract request mapper — subclass per provider.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { TemplateCanonicalRequest } from "../contracts/request-response";
import type { TemplateWirePayload } from "../contracts/wire";
import type { IProviderRequestMapper } from "../interfaces/provider-template";

export abstract class AbstractRequestMapper implements IProviderRequestMapper {
  toWireRequest(request: TemplateCanonicalRequest): Result<TemplateWirePayload> {
    const validated = this.validate(request);
    if (!validated.ok) return validated;
    return this.map(request);
  }

  protected validate(request: TemplateCanonicalRequest): Result<void> {
    if (!request.modelId?.trim()) {
      return failure(new ValidationError("modelId required"));
    }
    return success(undefined);
  }

  protected abstract map(
    request: TemplateCanonicalRequest
  ): Result<TemplateWirePayload>;
}
