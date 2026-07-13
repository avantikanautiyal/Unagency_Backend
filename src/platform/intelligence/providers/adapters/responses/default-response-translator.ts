/**
 * Default response translator.
 *
 * Purpose: Canonical ProviderAdapterResponse → runtime ProviderExecutionResponse.
 * Responsibilities: Map the fields the frozen runtime contract can hold; report
 *   canonical fields it cannot (droppedFields) rather than mutating the contract.
 * Usage: Injected into the adapter engine.
 * Future Extension: See ACP-A1 (enrich runtime response contract).
 */

import { success, type Result } from "../../../shared/result";
import type { ProviderExecutionResponse } from "../../runtime/contracts/provider-execution-response";
import type { ProviderAdapterResponse } from "../contracts/adapter-io";
import type { ProviderDiagnostic } from "../contracts/diagnostics";
import type { ProviderTranslationResult } from "../contracts/results";
import type { IResponseTranslator } from "../interfaces/translators";

export class DefaultResponseTranslator implements IResponseTranslator {
  toExecutionResponse(
    response: ProviderAdapterResponse
  ): Result<ProviderTranslationResult<ProviderExecutionResponse>> {
    const droppedFields: string[] = [];
    const warnings: ProviderDiagnostic[] = [...response.warnings];

    // The frozen runtime response contract cannot hold these canonical fields.
    if (response.finishReason) droppedFields.push("finishReason");
    if (response.safety.length > 0) droppedFields.push("safety");
    if (response.reasoning) droppedFields.push("reasoning");
    if (response.latencyMs !== undefined) droppedFields.push("latencyMs");

    const value: ProviderExecutionResponse = {
      requestId: response.requestId,
      providerId: response.providerId,
      output: response.output,
      usage: response.usage as Readonly<Record<string, unknown>> | undefined,
      streamed: response.streamed,
      finishedAt: response.createdAt,
    };

    return success({ value, warnings, droppedFields });
  }
}
