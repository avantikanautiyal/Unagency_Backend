/**
 * Default error mapper.
 */

import { createTemplateError, type TemplateProviderError } from "../contracts/errors";
import type { TemplateErrorKind } from "../contracts/enums";
import type { IProviderErrorMapper } from "../interfaces/provider-template";

export class DefaultErrorMapper implements IProviderErrorMapper {
  mapError(raw: unknown): TemplateProviderError {
    if (raw && typeof raw === "object" && "templateKind" in raw) {
      return raw as TemplateProviderError;
    }
    const message = raw instanceof Error ? raw.message : String(raw);
    const kind = this.inferKind(message);
    return createTemplateError(kind, "PROVIDER_ERROR", message, kind === "rate_limit" || kind === "timeout");
  }

  private inferKind(message: string): TemplateErrorKind {
    const lower = message.toLowerCase();
    if (lower.includes("auth")) return "authentication";
    if (lower.includes("rate")) return "rate_limit";
    if (lower.includes("quota")) return "quota";
    if (lower.includes("timeout")) return "timeout";
    if (lower.includes("network")) return "network";
    if (lower.includes("valid")) return "validation";
    if (lower.includes("model")) return "model";
    if (lower.includes("safety") || lower.includes("policy")) return "safety";
    if (lower.includes("stream")) return "streaming";
    if (lower.includes("tool")) return "tool";
    return "internal";
  }
}
