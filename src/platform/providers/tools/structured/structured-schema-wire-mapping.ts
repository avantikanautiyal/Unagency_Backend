/**
 * Deterministic structured-schema wire projection for provider-contract tests.
 */

import { mapCanonicalToAnthropicRequest } from "../../anthropic/requests/request-mapper";
import { mapCanonicalToOpenAIRequest } from "../../openai/requests/request-mapper";
import type { ProviderAdapterRequest } from "../../adapters/contracts/adapter-io";
import { CompatTextAdapter } from "../../compat/adapters/compat-text-adapter";
import { compatConfigByVendor } from "../../compat/configs/text-provider-configs";
import { buildTextProviderManifest } from "../../common/build-text-provider-manifest";
import {
  extractResponseFormatJsonSchema,
  type StructuredSchemaDowngradeStatus,
  type StructuredSchemaNativeEnforcement,
} from "./canonical-structured-contract-envelope";

export type StructuredContractWireProjection = {
  readonly providerId: string;
  readonly modelId: string;
  readonly schemaOnWire: unknown;
  readonly promptContractInjected: boolean;
  readonly nativeEnforcement: StructuredSchemaNativeEnforcement;
  readonly downgradeStatus: StructuredSchemaDowngradeStatus;
  readonly validation: "canonical_json_schema";
};

function promptHasContractGuidance(
  request: ProviderAdapterRequest,
  schemaName: string,
): boolean {
  const prompt =
    (typeof request.input.prompt === "string" && request.input.prompt) ||
    (typeof request.input.text === "string" && request.input.text) ||
    "";
  return (
    prompt.includes(`schema "${schemaName}"`) ||
    prompt.includes("Exact JSON schema:")
  );
}

function geminiWireFromRequest(
  request: ProviderAdapterRequest,
): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {};
  const rf = extractResponseFormatJsonSchema(request.input);
  if (rf) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseJsonSchema = rf.json_schema.schema;
  }
  return generationConfig;
}

function anthropicWireFromRequest(request: ProviderAdapterRequest): unknown {
  const wire = mapCanonicalToAnthropicRequest(request, request.modelId);
  const body = wire.body as Record<string, unknown>;
  const tools = body.tools as Array<Record<string, unknown>> | undefined;
  return tools?.[0]?.input_schema ?? null;
}

function openAiWireFromRequest(request: ProviderAdapterRequest): unknown {
  const wire = mapCanonicalToOpenAIRequest(request, request.modelId);
  const body = wire.body as Record<string, unknown>;
  const rf = body.response_format as
    | { type?: string; json_schema?: { schema?: unknown } }
    | undefined;
  if (rf?.type === "json_schema") {
    return rf.json_schema?.schema ?? rf;
  }
  return rf ?? null;
}

function compatWireFromRequest(
  vendor: string,
  request: ProviderAdapterRequest,
  wireModelId: string,
): {
  schemaOnWire: unknown;
  nativeEnforcement: StructuredSchemaNativeEnforcement;
  downgradeStatus: StructuredSchemaDowngradeStatus;
  warnings: readonly { code?: string }[];
} {
  const config = compatConfigByVendor(vendor);
  if (!config) {
    throw new Error(`Unknown compat vendor: ${vendor}`);
  }
  const manifest = buildTextProviderManifest({
    providerId: config.canonicalProviderId,
    vendor: config.vendor,
    displayName: config.vendor,
    version: config.version,
    wireModels: config.seedWireModels,
    capabilities: ["text.generate"],
    nowIso: new Date().toISOString(),
  });
  const adapter = new CompatTextAdapter(config, manifest, config.seedWireModels);
  const translated = adapter.translateRequest({ ...request, modelId: wireModelId });
  if (!translated.ok) {
    throw translated.error;
  }
  const body = translated.value.value.body as Record<string, unknown>;
  const rf = body.response_format;
  const downgraded =
    rf &&
    typeof rf === "object" &&
    (rf as { type?: string }).type === "json_object" &&
    extractResponseFormatJsonSchema(request.input) != null;
  return {
    schemaOnWire: rf ?? null,
    nativeEnforcement: "prompt_and_validation_only",
    downgradeStatus: downgraded ? "json_schema_to_json_object" : "none",
    warnings: translated.value.warnings,
  };
}

export function projectStructuredContractWire(input: {
  readonly providerId: string;
  readonly modelId: string;
  readonly adapterRequest: ProviderAdapterRequest;
}): StructuredContractWireProjection {
  const schemaName =
    extractResponseFormatJsonSchema(input.adapterRequest.input)?.json_schema
      .name ?? "response";
  const promptContractInjected = promptHasContractGuidance(
    input.adapterRequest,
    schemaName,
  );
  const base = {
    providerId: input.providerId,
    modelId: input.modelId,
    promptContractInjected,
    validation: "canonical_json_schema" as const,
  };

  if (input.providerId === "provider.openai") {
    return {
      ...base,
      schemaOnWire: openAiWireFromRequest(input.adapterRequest),
      nativeEnforcement: "openai_json_schema_strict",
      downgradeStatus: "none",
    };
  }

  if (input.providerId === "provider.anthropic") {
    return {
      ...base,
      schemaOnWire: anthropicWireFromRequest(input.adapterRequest),
      nativeEnforcement: "anthropic_tool_input_schema",
      downgradeStatus: "none",
    };
  }

  if (input.providerId === "provider.gemini") {
    const generationConfig = geminiWireFromRequest(input.adapterRequest);
    return {
      ...base,
      schemaOnWire: generationConfig.responseJsonSchema ?? generationConfig,
      nativeEnforcement: generationConfig.responseJsonSchema
        ? "gemini_response_json_schema"
        : "prompt_and_validation_only",
      downgradeStatus: generationConfig.responseJsonSchema
        ? "none"
        : "schema_not_transmitted",
    };
  }

  const vendor = input.providerId.replace(/^provider\./, "");
  const compat = compatWireFromRequest(
    vendor,
    input.adapterRequest,
    input.modelId.includes("/") ? input.modelId.split("/").slice(1).join("/") : input.modelId,
  );
  return {
    ...base,
    schemaOnWire: compat.schemaOnWire,
    nativeEnforcement: compat.nativeEnforcement,
    downgradeStatus: compat.downgradeStatus,
  };
}

/** Active CDF text providers exercised by deterministic contract tests. */
export const ACTIVE_STRUCTURED_CONTRACT_PROVIDERS: readonly {
  readonly providerId: string;
  readonly modelId: string;
}[] = [
  { providerId: "provider.openai", modelId: "openai/gpt-4o" },
  { providerId: "provider.anthropic", modelId: "anthropic/claude-sonnet-4-5" },
  { providerId: "provider.gemini", modelId: "gemini/gemini-2.5-flash" },
  { providerId: "provider.mistral", modelId: "mistral/mistral-large" },
  { providerId: "provider.meta", modelId: "meta/Llama-4-Maverick-17B-128E-Instruct-FP8" },
  { providerId: "provider.deepseek", modelId: "deepseek/deepseek-chat" },
  { providerId: "provider.moonshot", modelId: "moonshot/kimi-k2" },
  { providerId: "provider.xai", modelId: "xai/grok-2" },
  { providerId: "provider.groq", modelId: "groq/llama-3.3-70b-versatile" },
];
