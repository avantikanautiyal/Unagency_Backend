/**
 * Provider-neutral canonical structured-contract envelope.
 *
 * Source of truth: immutable CDF / product schema on the request envelope.
 * Provider adapters map the same canonical schema to native wire mechanisms;
 * OpenAI strict normalization applies only at OpenAI wire time.
 */

import {
  listRegisteredCanonicalStructuredContractNames,
  resolveStructuredOutputSchemaByContractName,
} from "../../../cdf/structured-output-contract";
import type { StructuredOutputRequest } from "../contracts/tool-contracts";
import type { ProviderDiagnostic } from "../../adapters/contracts/diagnostics";

export type StructuredSchemaNativeEnforcement =
  | "openai_json_schema_strict"
  | "anthropic_tool_input_schema"
  | "gemini_response_json_schema"
  | "prompt_and_validation_only";

export type StructuredSchemaDowngradeStatus =
  | "none"
  | "json_schema_to_json_object"
  | "schema_not_transmitted";

export type CanonicalStructuredContractEnvelope = {
  readonly name: string;
  readonly canonicalSchema: Readonly<Record<string, unknown>>;
  readonly strict: boolean;
  readonly promptInstructionBlock: string;
  readonly isRegisteredCanonicalContract: boolean;
};

export type ResponseFormatJsonSchema = {
  readonly type: "json_schema";
  readonly json_schema: {
    readonly name: string;
    readonly strict: boolean;
    readonly schema: Record<string, unknown>;
  };
};

const REGISTERED_CANONICAL = new Set(listRegisteredCanonicalStructuredContractNames());

export function isRegisteredCanonicalStructuredContractName(
  name: string | null | undefined,
): boolean {
  const key = name?.trim();
  if (!key) return false;
  return REGISTERED_CANONICAL.has(key);
}

/** Deep-clone schema — never mutate registry / stamp source objects. */
export function cloneCanonicalSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
}

export function buildCanonicalSchemaPromptInstruction(input: {
  readonly schemaName: string;
  readonly schema: Readonly<Record<string, unknown>>;
}): string {
  const requiredKeys = Array.isArray(input.schema.required)
    ? (input.schema.required as string[]).filter((k) => typeof k === "string")
    : [];
  const rootType =
    typeof input.schema.type === "string" ? input.schema.type : "object";
  const parts = [
    `Return a single JSON value matching schema "${input.schemaName}".`,
    rootType === "array"
      ? "The root value must match the schema array shape."
      : "Do NOT return a bare JSON array unless the schema root type is array.",
    rootType === "object"
      ? "The root value must be a JSON object ({ ... }) when the schema type is object."
      : "",
    requiredKeys.length
      ? `Required top-level keys: ${requiredKeys.join(", ")}.`
      : "Include every required key declared in the JSON schema.",
    "Do NOT omit required fields. Do NOT wrap the value in an extra envelope key.",
    `Exact JSON schema:\n${JSON.stringify(input.schema)}`,
  ].filter(Boolean);
  return parts.join("\n");
}

export function extractResponseFormatJsonSchema(
  input: Readonly<Record<string, unknown>> | undefined,
): ResponseFormatJsonSchema | undefined {
  if (!input) return undefined;
  const rf = input.response_format;
  if (!rf || typeof rf !== "object") return undefined;
  const typed = rf as { type?: string; json_schema?: unknown };
  if (typed.type !== "json_schema") return undefined;
  const js = typed.json_schema;
  if (!js || typeof js !== "object") return undefined;
  const block = js as {
    name?: unknown;
    strict?: unknown;
    schema?: unknown;
  };
  if (!block.schema || typeof block.schema !== "object") return undefined;
  const name =
    typeof block.name === "string" && block.name.trim()
      ? block.name.trim()
      : "response";
  return {
    type: "json_schema",
    json_schema: {
      name,
      strict: block.strict !== false,
      schema: block.schema as Record<string, unknown>,
    },
  };
}

export function buildCanonicalStructuredContractEnvelope(
  structured: StructuredOutputRequest,
): CanonicalStructuredContractEnvelope {
  const name = structured.name?.trim() || "response";
  const registered = resolveStructuredOutputSchemaByContractName(name);
  const canonicalSchema = cloneCanonicalSchema(
    (registered?.schema ?? structured.schema) as Record<string, unknown>,
  );
  const strict = structured.strict ?? registered?.strict ?? true;
  return {
    name,
    canonicalSchema,
    strict,
    promptInstructionBlock: buildCanonicalSchemaPromptInstruction({
      schemaName: name,
      schema: canonicalSchema,
    }),
    isRegisteredCanonicalContract: isRegisteredCanonicalStructuredContractName(name),
  };
}

export function buildStructuredSchemaDowngradeDiagnostic(input: {
  readonly vendor: string;
  readonly schemaName?: string;
  readonly from: "json_schema";
  readonly to: "json_object";
  readonly nativeEnforcement: StructuredSchemaNativeEnforcement;
}): ProviderDiagnostic {
  return {
    code: "structured_schema_enforcement_downgraded",
    message: `${input.vendor}: response_format.json_schema downgraded to json_object; contract enforced via prompt guidance and canonical validation`,
    severity: "warning",
    source: input.vendor,
    data: {
      schemaName: input.schemaName ?? null,
      from: input.from,
      to: input.to,
      nativeEnforcement: input.nativeEnforcement,
      downgradeStatus: "json_schema_to_json_object" satisfies StructuredSchemaDowngradeStatus,
    },
  };
}

export function captureRawProviderOutputContent(
  output: Readonly<Record<string, unknown>>,
): string {
  if (output.structured != null && typeof output.structured === "object") {
    return JSON.stringify(output.structured);
  }
  if (typeof output.content === "string") {
    return output.content;
  }
  if (output.content != null) {
    return JSON.stringify(output.content);
  }
  if (typeof output.text === "string") {
    return output.text;
  }
  return "";
}
