/**
 * Phase 11 — Thin provider-neutral result envelope over existing ProviderExecutionResult.
 */

import type { ProviderExecutionResult } from "../../providers/runtime/contracts/provider-execution-response";
import { categorizeProviderRuntimeError } from "./errors";
import { MODEL_RUNTIME_SOURCE } from "./types";

export type ModelRuntimeNormalizedResult = {
  readonly source: typeof MODEL_RUNTIME_SOURCE;
  readonly ok: boolean;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly contentText?: string;
  readonly structuredOutput?: unknown;
  readonly usage?: unknown;
  readonly finishReason?: string;
  readonly providerRequestId?: string;
  readonly errorCategory?: string;
  readonly errorMessageSafe?: string;
  /** Underlying provider result retained for existing DirectEngine consumers. */
  readonly providerResult: ProviderExecutionResult;
};

/**
 * Normalize an existing ProviderExecutionResult into a provider-neutral view.
 * Does not redesign artifact ingestion; preserves the original result.
 */
export function normalizeProviderExecutionResult(input: {
  readonly result: ProviderExecutionResult;
  readonly error?: unknown;
}): ModelRuntimeNormalizedResult {
  const output = (input.result.response?.output ?? {}) as Record<string, unknown>;
  const text =
    typeof output.text === "string"
      ? output.text
      : typeof output.content === "string"
        ? output.content
        : typeof output.message === "string"
          ? output.message
          : undefined;
  const errSource = input.error ?? input.result.error;
  const err = errSource
    ? categorizeProviderRuntimeError(errSource)
    : undefined;

  return {
    source: MODEL_RUNTIME_SOURCE,
    ok: input.result.success,
    providerId:
      input.result.finalProviderId ??
      (input.result.response
        ? String(input.result.response.providerId)
        : undefined),
    modelId: input.result.finalModelId,
    contentText: text,
    structuredOutput: output.structuredOutput ?? output.json ?? output.data,
    usage: input.result.response?.usage ?? output.usage,
    finishReason:
      typeof output.finishReason === "string" ? output.finishReason : undefined,
    providerRequestId: input.result.response?.providerRequestId,
    errorCategory: err?.category,
    errorMessageSafe: err?.messageSafe,
    providerResult: input.result,
  };
}
