/**
 * Canonical → Anthropic Messages API request mapping.
 *
 * OpenAI-style `response_format.json_schema` is converted to a forced
 * `tool_use` call so Claude must emit schema-valid JSON (Anthropic does not
 * accept OpenAI response_format on /v1/messages).
 */

import type { ProviderAdapterRequest, ProviderWirePayload } from "../../adapters/contracts/adapter-io";
import { mapToAnthropicVisionContent } from "../../common/vision-content";
import { transformSchemaForAnthropicToolInput } from "../structured-output/schema-transform";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function sanitizeToolName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return cleaned || "structured_output";
}

function extractJsonSchemaTool(
  input: Record<string, unknown>
): { name: string; schema: Record<string, unknown> } | undefined {
  const responseFormat = asRecord(input.response_format);
  if (!responseFormat || responseFormat.type !== "json_schema") return undefined;
  const jsonSchema = asRecord(responseFormat.json_schema);
  if (!jsonSchema) return undefined;
  const schema = asRecord(jsonSchema.schema);
  if (!schema) return undefined;
  const name =
    typeof jsonSchema.name === "string" && jsonSchema.name.trim()
      ? sanitizeToolName(jsonSchema.name.trim())
      : "structured_output";
  return { name, schema };
}

export function mapCanonicalToAnthropicRequest(
  request: ProviderAdapterRequest,
  wireModelId: string
): ProviderWirePayload {
  const isVision =
    request.features.includes("vision") ||
    request.modality === "multimodal" ||
    String(request.capabilityId).toLowerCase().includes("vision");

  const messages =
    (request.input.messages as Array<Record<string, unknown>>) ??
    (request.input.prompt || isVision
      ? [{ role: "user", content: isVision ? mapToAnthropicVisionContent(request) : request.input.prompt }]
      : [{ role: "user", content: JSON.stringify(request.input) }]);

  const anthropicMessages = messages.map((m) => {
    if (Array.isArray(m.content)) {
      return {
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      };
    }
    return {
      role: m.role === "assistant" ? "assistant" : "user",
      content:
        typeof m.content === "string"
          ? m.content
          : JSON.stringify(m.content),
    };
  });

  const params = request.parameters;
  const maxTokens =
    typeof params.maxTokens === "number"
      ? params.maxTokens
      : typeof params.max_tokens === "number"
        ? params.max_tokens
        : 4096;

  const structuredTool = extractJsonSchemaTool(
    request.input as Record<string, unknown>
  );

  const body: Record<string, unknown> = {
    model: wireModelId,
    max_tokens: maxTokens,
    messages: anthropicMessages,
  };

  if (structuredTool) {
    body.tools = [
      {
        name: structuredTool.name,
        description: `Return the complete JSON object matching schema "${structuredTool.name}". No markdown.`,
        input_schema: transformSchemaForAnthropicToolInput(structuredTool.schema),
      },
    ];
    body.tool_choice = { type: "tool", name: structuredTool.name };
  }

  return Object.freeze({
    operation: "messages.create",
    path: "/v1/messages",
    body: Object.freeze(body),
  });
}

export function canonicalToWireModelId(modelId: string): string {
  if (modelId.includes("/")) {
    const [prefix, ...rest] = modelId.split("/");
    if (prefix === "anthropic") return rest.join("/");
    return rest.join("/");
  }
  return modelId;
}
