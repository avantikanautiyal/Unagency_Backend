/**
 * Safe diagnostics for presentation concepts → routes expansion (no secrets / no full prompts).
 */

import type { ProviderExecutionResult } from "../../runtime/contracts/provider-execution-response";
import {
  parsePresentationRoutes,
  recoverPresentationRoutesPayload,
} from "../../../os/delivery/document-export-service";

export type PresentationExpansionFailureCategory =
  | "PROVIDER_ERROR"
  | "INVALID_STRUCTURED_OUTPUT"
  | "ROUTES_NOT_FOUND"
  | "ROUTES_NOT_EXPORTABLE"
  | "MATERIALIZATION_FAILURE"
  | "EXPANSION_OK";

export type PresentationExpansionResponseSummary = {
  readonly structuredPresent: boolean;
  readonly structuredType: string;
  readonly structuredTopKeys: readonly string[];
  readonly contentPresent: boolean;
  readonly contentType: string;
  readonly contentLength: number;
  readonly textPresent: boolean;
  readonly toolResultPresent: boolean;
  readonly finishReason?: string;
};

export type PresentationExpansionDiagnostic = {
  readonly requestId: string;
  readonly executionId?: string;
  readonly correlationId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly schemaName: string;
  readonly providerSuccess: boolean;
  readonly providerErrorCode?: string;
  readonly providerErrorCategory?: string;
  readonly httpStatusHint?: string;
  readonly response: PresentationExpansionResponseSummary;
  readonly extractionBranch?: string;
  readonly recoveryBranch?: string;
  readonly parseExportable: boolean;
  readonly failureCategory: PresentationExpansionFailureCategory;
};

const LOG_PREFIX = "📑 [PresentationExpansionDiag]";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function boundedKeys(value: unknown, max = 8): readonly string[] {
  const rec = asRecord(value);
  if (!rec) return Object.freeze([]);
  return Object.freeze(Object.keys(rec).slice(0, max));
}

function contentTypeOf(value: unknown): string {
  if (value == null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function contentLengthOf(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (value == null) return 0;
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function httpStatusFromMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  const match = message.match(/HTTP\s+(\d{3})/i);
  return match?.[1];
}

function providerErrorCategory(
  code: string | undefined,
  message: string | undefined
): string | undefined {
  const blob = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  if (blob.includes("401") || blob.includes("authentication")) return "authentication";
  if (blob.includes("403")) return "authorization";
  if (blob.includes("429") || blob.includes("rate")) return "rate_limit";
  if (blob.includes("timeout") || blob.includes("timed out")) return "timeout";
  if (blob.includes("404") || blob.includes("not_found")) return "not_found";
  if (blob.includes("400") || blob.includes("invalid")) return "invalid_request";
  if (blob.includes("500") || blob.includes("502") || blob.includes("503")) {
    return "provider_internal";
  }
  if (code === "STRUCTURED_OUTPUT_INVALID") return "invalid_structured_output";
  if (code === "PRESENTATION_OFF_BRIEF") return "presentation_off_brief";
  return undefined;
}

export function summarizeProviderOutput(
  output: Readonly<Record<string, unknown>>
): PresentationExpansionResponseSummary {
  const structured = output.structured;
  const toolCalls = output.tool_calls;
  return Object.freeze({
    structuredPresent: structured != null && typeof structured === "object",
    structuredType: contentTypeOf(structured),
    structuredTopKeys: boundedKeys(structured),
    contentPresent: output.content != null && contentLengthOf(output.content) > 0,
    contentType: contentTypeOf(output.content),
    contentLength: contentLengthOf(output.content),
    textPresent:
      typeof output.text === "string" && (output.text as string).trim().length > 0,
    toolResultPresent: Array.isArray(toolCalls) && toolCalls.length > 0,
    finishReason:
      typeof output.finishReason === "string" ? output.finishReason : undefined,
  });
}

export function classifyPresentationExpansionOutcome(input: {
  readonly providerResult: ProviderExecutionResult;
  readonly structuredOutputValid?: boolean;
  readonly parsedExportable: boolean;
  readonly hasRoutesArray: boolean;
}): PresentationExpansionFailureCategory {
  const code = input.providerResult.error?.code;

  if (code === "STRUCTURED_OUTPUT_INVALID") {
    return "INVALID_STRUCTURED_OUTPUT";
  }

  if (
    input.providerResult.success === false &&
    code !== "PRESENTATION_OFF_BRIEF"
  ) {
    return "PROVIDER_ERROR";
  }

  if (input.structuredOutputValid === false || code === "PRESENTATION_OFF_BRIEF") {
    if (!input.hasRoutesArray && !input.parsedExportable) {
      return "ROUTES_NOT_FOUND";
    }
    return "ROUTES_NOT_EXPORTABLE";
  }

  if (!input.parsedExportable) {
    if (!input.hasRoutesArray) return "ROUTES_NOT_FOUND";
    return "ROUTES_NOT_EXPORTABLE";
  }

  return "EXPANSION_OK";
}

export function buildPresentationExpansionDiagnostic(input: {
  readonly requestId: string;
  readonly providerRequest: {
    readonly requestId?: string;
    readonly providerId?: string;
    readonly modelId?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  };
  readonly providerResult: ProviderExecutionResult;
  readonly schemaName: string;
  readonly output: Readonly<Record<string, unknown>>;
  readonly extractionBranch?: string;
  readonly recoveryBranch?: string;
  readonly structuredOutputValid?: boolean;
}): PresentationExpansionDiagnostic {
  const meta = input.providerRequest.metadata ?? {};
  const recovered = recoverPresentationRoutesPayload(
    input.output.structured ?? input.output.content
  );
  const routes = parsePresentationRoutes(recovered);
  const hasRoutesArray =
    asRecord(input.output.structured)?.routes != null ||
    (() => {
      try {
        const raw =
          typeof input.output.content === "string"
            ? JSON.parse(input.output.content)
            : input.output.content;
        return Array.isArray(asRecord(raw)?.routes);
      } catch {
        return false;
      }
    })();

  const err = input.providerResult.error;
  const failureCategory = classifyPresentationExpansionOutcome({
    providerResult: input.providerResult,
    structuredOutputValid: input.structuredOutputValid,
    parsedExportable: routes != null,
    hasRoutesArray,
  });

  return Object.freeze({
    requestId: input.requestId,
    executionId:
      typeof meta.executionId === "string" ? meta.executionId : undefined,
    correlationId:
      typeof meta.correlationId === "string" ? meta.correlationId : undefined,
    providerId: String(
      input.providerRequest.providerId ??
        input.providerResult.response?.providerId ??
        "unknown"
    ),
    modelId: String(input.providerRequest.modelId ?? "unknown"),
    schemaName: input.schemaName,
    providerSuccess: input.providerResult.success !== false,
    providerErrorCode: err?.code,
    providerErrorCategory: providerErrorCategory(err?.code, err?.message),
    httpStatusHint: httpStatusFromMessage(err?.message),
    response: summarizeProviderOutput(input.output),
    extractionBranch: input.extractionBranch,
    recoveryBranch: input.recoveryBranch,
    parseExportable: routes != null,
    failureCategory,
  });
}

export function logPresentationExpansionDiagnostic(
  diagnostic: PresentationExpansionDiagnostic
): void {
  console.log(
    `${LOG_PREFIX} ${JSON.stringify({
      requestId: diagnostic.requestId,
      executionId: diagnostic.executionId,
      providerId: diagnostic.providerId,
      modelId: diagnostic.modelId,
      schema: diagnostic.schemaName,
      providerSuccess: diagnostic.providerSuccess,
      providerErrorCode: diagnostic.providerErrorCode,
      providerErrorCategory: diagnostic.providerErrorCategory,
      httpStatusHint: diagnostic.httpStatusHint,
      response: diagnostic.response,
      extractionBranch: diagnostic.extractionBranch,
      recoveryBranch: diagnostic.recoveryBranch,
      parseExportable: diagnostic.parseExportable,
      failureCategory: diagnostic.failureCategory,
    })}`
  );
}

export function inferPresentationExtractionBranch(
  output: Readonly<Record<string, unknown>>
): string {
  if (output.structured != null && typeof output.structured === "object") {
    if (parsePresentationRoutes(recoverPresentationRoutesPayload(output.structured))) {
      return "structured_exportable";
    }
    return "structured_present_not_exportable";
  }
  if (typeof output.content === "string" && output.content.trim()) {
    if (parsePresentationRoutes(recoverPresentationRoutesPayload(output.content))) {
      return "content_json_exportable";
    }
    return "content_string";
  }
  if (typeof output.text === "string" && output.text.trim()) {
    if (parsePresentationRoutes(recoverPresentationRoutesPayload(output.text))) {
      return "text_json_exportable";
    }
    return "text_string";
  }
  if (Array.isArray(output.tool_calls) && output.tool_calls.length > 0) {
    return "tool_calls_present";
  }
  return "none";
}

export function expansionLogLabel(
  category: PresentationExpansionFailureCategory
): string {
  switch (category) {
    case "EXPANSION_OK":
      return "ok";
    case "PROVIDER_ERROR":
      return "provider_error";
    case "INVALID_STRUCTURED_OUTPUT":
      return "invalid_structured_output";
    case "ROUTES_NOT_FOUND":
      return "missing_routes";
    case "ROUTES_NOT_EXPORTABLE":
      return "routes_not_exportable";
    case "MATERIALIZATION_FAILURE":
      return "materialization_failure";
    default:
      return "missing_routes";
  }
}
