/**
 * Minimal JSON Schema subset validator (object/array/string/number/boolean/integer/null).
 * No Ajv/Zod dependency — platform-owned for tool args + structured output.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { JsonSchemaLike } from "../contracts/tool-contracts";

const MAX_DEPTH = 12;
const MAX_PROPERTIES = 64;
const MAX_ARRAY_ITEMS = 100;
const MAX_STRING_LENGTH = 32_768;
const MAX_OBJECT_KEYS_SCAN = 128;

export interface SchemaValidationOptions {
  readonly maxDepth?: number;
  readonly allowAdditionalProperties?: boolean;
}

export function validateAgainstJsonSchema(
  value: unknown,
  schema: JsonSchemaLike,
  options: SchemaValidationOptions = {}
): Result<{ readonly value: unknown }> {
  const maxDepth = options.maxDepth ?? MAX_DEPTH;
  const errors: string[] = [];
  walk(value, schema, "$", 0, maxDepth, options.allowAdditionalProperties ?? false, errors);
  if (errors.length > 0) {
    return failure(new ValidationError(errors.slice(0, 12).join("; ")));
  }
  return success({ value });
}

export function parseAndValidateJson(
  raw: string,
  schema: JsonSchemaLike,
  options?: SchemaValidationOptions
): Result<{ readonly value: unknown }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return failure(new ValidationError("Structured output is not valid JSON"));
  }
  return validateAgainstJsonSchema(parsed, schema, options);
}

export function validateSchemaDocument(schema: JsonSchemaLike): Result<true> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return failure(new ValidationError("Schema must be a JSON object"));
  }
  const keys = Object.keys(schema);
  if (keys.length > MAX_OBJECT_KEYS_SCAN) {
    return failure(new ValidationError("Schema exceeds size bound"));
  }
  const depth = schemaDepth(schema, 0);
  if (depth > MAX_DEPTH) {
    return failure(new ValidationError(`Schema depth ${depth} exceeds max ${MAX_DEPTH}`));
  }
  return success(true);
}

function schemaDepth(schema: JsonSchemaLike, depth: number): number {
  if (depth > MAX_DEPTH) return depth;
  let max = depth;
  const props = schema.properties as Record<string, JsonSchemaLike> | undefined;
  if (props && typeof props === "object") {
    for (const v of Object.values(props)) {
      if (v && typeof v === "object") max = Math.max(max, schemaDepth(v, depth + 1));
    }
  }
  const items = schema.items as JsonSchemaLike | undefined;
  if (items && typeof items === "object") {
    max = Math.max(max, schemaDepth(items, depth + 1));
  }
  return max;
}

function walk(
  value: unknown,
  schema: JsonSchemaLike,
  path: string,
  depth: number,
  maxDepth: number,
  allowAdditional: boolean,
  errors: string[]
): void {
  if (depth > maxDepth) {
    errors.push(`${path}: exceeds max depth`);
    return;
  }

  const type = schema.type as string | string[] | undefined;
  const types = Array.isArray(type) ? type : type ? [type] : undefined;

  if (types && !matchesType(value, types)) {
    errors.push(`${path}: expected type ${types.join("|")}, got ${describeType(value)}`);
    return;
  }

  if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
    errors.push(`${path}: string exceeds max length`);
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length > MAX_PROPERTIES) {
      errors.push(`${path}: too many properties`);
      return;
    }
    // Prototype pollution keys
    for (const k of keys) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") {
        errors.push(`${path}: disallowed property '${k}'`);
      }
    }
    const props = (schema.properties as Record<string, JsonSchemaLike> | undefined) ?? {};
    const required = (schema.required as string[] | undefined) ?? [];
    for (const r of required) {
      if (!(r in obj)) errors.push(`${path}: missing required property '${r}'`);
    }
    const additional = schema.additionalProperties;
    const allowExtra =
      allowAdditional || additional === true || additional === undefined
        ? additional !== false
        : false;
    for (const [k, v] of Object.entries(obj)) {
      if (props[k]) {
        walk(v, props[k]!, `${path}.${k}`, depth + 1, maxDepth, allowAdditional, errors);
      } else if (!allowExtra) {
        errors.push(`${path}: unexpected property '${k}'`);
      }
    }
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      errors.push(`${path}: array exceeds max items`);
      return;
    }
    const minItems = schema.minItems;
    if (typeof minItems === "number" && value.length < minItems) {
      errors.push(`${path}: expected at least ${minItems} items, got ${value.length}`);
    }
    const maxItems = schema.maxItems;
    if (typeof maxItems === "number" && value.length > maxItems) {
      errors.push(`${path}: expected at most ${maxItems} items, got ${value.length}`);
    }
    const items = schema.items as JsonSchemaLike | undefined;
    if (items) {
      value.forEach((item, i) =>
        walk(item, items, `${path}[${i}]`, depth + 1, maxDepth, allowAdditional, errors)
      );
    }
  }
}

function matchesType(value: unknown, types: readonly string[]): boolean {
  return types.some((t) => {
    switch (t) {
      case "object":
        return value !== null && typeof value === "object" && !Array.isArray(value);
      case "array":
        return Array.isArray(value);
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number" && Number.isFinite(value);
      case "integer":
        return typeof value === "number" && Number.isInteger(value);
      case "boolean":
        return typeof value === "boolean";
      case "null":
        return value === null;
      default:
        return true;
    }
  });
}

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
