/**
 * Safe wire-request summaries for presentation expansion (no prompts/secrets).
 */

import { mapCanonicalToOpenAIRequest } from "../../openai/requests/request-mapper";
import { mapCanonicalToAnthropicRequest } from "../../anthropic/requests/request-mapper";
import { toAdapterRequestFromExecution } from "../../common/to-adapter-request";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";

export type PresentationExpansionWireSummary = {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly structuredOutputMode: string;
  readonly schemaName?: string;
  readonly schemaBytes: number;
  readonly messageCount: number;
  readonly approximateInputBytes: number;
  readonly toolCount: number;
  readonly wireParameterNames: readonly string[];
  readonly hasInvalidOpenAiMaxTokens?: boolean;
  readonly usesMaxCompletionTokens?: boolean;
};

function schemaNameFromPayload(payload: Record<string, unknown>): string | undefined {
  const rf = payload.response_format as
    | { json_schema?: { name?: string } }
    | undefined;
  return typeof rf?.json_schema?.name === "string" ? rf.json_schema.name : undefined;
}

function schemaBytesFromPayload(payload: Record<string, unknown>): number {
  const rf = payload.response_format as
    | { json_schema?: { schema?: unknown } }
    | undefined;
  const schema = rf?.json_schema?.schema;
  if (schema == null) return 0;
  try {
    return JSON.stringify(schema).length;
  } catch {
    return 0;
  }
}

function approximateInputBytes(payload: Record<string, unknown>): number {
  const messages = payload.messages as Array<{ content?: unknown }> | undefined;
  if (Array.isArray(messages)) {
    return messages.reduce((sum, m) => {
      const c = m.content;
      if (typeof c === "string") return sum + c.length;
      try {
        return sum + JSON.stringify(c).length;
      } catch {
        return sum;
      }
    }, 0);
  }
  const prompt =
    (typeof payload.prompt === "string" && payload.prompt) ||
    (typeof payload.text === "string" && payload.text) ||
    "";
  return prompt.length;
}

export function summarizePresentationExpansionWireRequest(
  request: ProviderExecutionRequest
): PresentationExpansionWireSummary | undefined {
  const payload = request.payload as Record<string, unknown>;
  if (payload.response_format == null) return undefined;

  const providerId = String(request.providerId ?? "");
  const modelId = String(request.modelId ?? "");
  const capabilityId = String(request.capabilityId ?? "");
  const nowIso = new Date().toISOString();

  const rf = payload.response_format as { type?: string } | undefined;
  const structuredOutputMode =
    rf?.type === "json_schema" ? "json_schema" : String(rf?.type ?? "unknown");

  if (providerId.includes("openai")) {
    const adapterReq = toAdapterRequestFromExecution({
      request,
      canonicalProviderId: providerId,
      adapterId: "openai",
      nowIso,
    });
    const wireModel = modelId.includes("/")
      ? (modelId.split("/").pop() ?? modelId)
      : modelId;
    const wire = mapCanonicalToOpenAIRequest(adapterReq, wireModel);
    const body = wire.body as Record<string, unknown>;
    return Object.freeze({
      providerId,
      modelId,
      capabilityId,
      structuredOutputMode,
      schemaName: schemaNameFromPayload(payload),
      schemaBytes: schemaBytesFromPayload(payload),
      messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
      approximateInputBytes: approximateInputBytes(payload),
      toolCount: Array.isArray(body.tools) ? body.tools.length : 0,
      wireParameterNames: Object.freeze(Object.keys(body).sort()),
      hasInvalidOpenAiMaxTokens: Object.prototype.hasOwnProperty.call(body, "maxTokens"),
      usesMaxCompletionTokens: Object.prototype.hasOwnProperty.call(
        body,
        "max_completion_tokens"
      ),
    });
  }

  if (providerId.includes("anthropic")) {
    const adapterReq = toAdapterRequestFromExecution({
      request,
      canonicalProviderId: providerId,
      adapterId: "anthropic",
      nowIso,
    });
    const wireModel = modelId.includes("/")
      ? (modelId.split("/").slice(1).join("/") || modelId)
      : modelId;
    const wire = mapCanonicalToAnthropicRequest(adapterReq, wireModel);
    const body = wire.body as Record<string, unknown>;
    return Object.freeze({
      providerId,
      modelId,
      capabilityId,
      structuredOutputMode: "anthropic_tool_input_schema",
      schemaName: schemaNameFromPayload(payload),
      schemaBytes: schemaBytesFromPayload(payload),
      messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
      approximateInputBytes: approximateInputBytes(payload),
      toolCount: Array.isArray(body.tools) ? body.tools.length : 0,
      wireParameterNames: Object.freeze(Object.keys(body).sort()),
    });
  }

  return undefined;
}

export function sanitizeProviderHttpErrorDetail(
  message: string | undefined,
  output?: Readonly<Record<string, unknown>>
): string | undefined {
  const err = output?.error as
    | { code?: string; message?: string; param?: string }
    | undefined;
  const parts: string[] = [];
  if (message?.trim()) parts.push(message.trim());
  if (err?.param) parts.push(`param=${err.param}`);
  if (err?.code && err.code !== "PROVIDER_ERROR") parts.push(`code=${err.code}`);
  const metaMsg = err?.message?.trim();
  if (metaMsg && metaMsg !== message?.trim()) parts.push(metaMsg);
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

const WIRE_LOG_PREFIX = "📑 [PresentationExpansionWire]";

export function logPresentationExpansionWireSummary(
  summary: PresentationExpansionWireSummary | undefined
): void {
  if (!summary) return;
  console.log(
    `${WIRE_LOG_PREFIX} ${JSON.stringify({
      providerId: summary.providerId,
      modelId: summary.modelId,
      capability: summary.capabilityId,
      mode: summary.structuredOutputMode,
      schema: summary.schemaName,
      schemaBytes: summary.schemaBytes,
      messageCount: summary.messageCount,
      approxInputBytes: summary.approximateInputBytes,
      toolCount: summary.toolCount,
      wireParams: summary.wireParameterNames,
      invalidOpenAiMaxTokens: summary.hasInvalidOpenAiMaxTokens ?? false,
      usesMaxCompletionTokens: summary.usesMaxCompletionTokens ?? false,
    })}`
  );
}
