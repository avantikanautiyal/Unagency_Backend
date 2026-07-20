/**
 * Usage mapper — extracts token usage from wire payload.
 */

import { success, type Result } from "../../../shared/result";
import type { TemplateTokenUsage } from "../contracts/request-response";
import type { TemplateWirePayload } from "../contracts/wire";
import type { IProviderUsageMapper } from "../interfaces/provider-template";

export class DefaultUsageMapper implements IProviderUsageMapper {
  mapUsage(wire: TemplateWirePayload): Result<TemplateTokenUsage> {
    const usage = (wire.usage ?? wire.token_usage ?? {}) as Record<string, number>;
    return success({
      promptTokens: usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens,
      completionTokens: usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens,
      totalTokens: usage.total_tokens ?? usage.totalTokens,
      reasoningTokens: usage.reasoning_tokens ?? usage.reasoningTokens,
    });
  }
}
