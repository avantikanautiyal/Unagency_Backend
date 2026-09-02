/**
 * Transform canonical JSON Schema → Anthropic tool input_schema wire subset.
 *
 * Canonical application schemas may use minItems/maxItems and other constraints
 * Anthropic rejects with HTTP 400. Constraints are moved into descriptions;
 * client-side validation still uses the canonical schema.
 */

const UNSUPPORTED_SCALAR_KEYS = new Set([
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "uniqueItems",
  "minProperties",
  "maxProperties",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function appendDescription(existing: unknown, hint: string): string {
  const base =
    typeof existing === "string" && existing.trim() ? existing.trim() : "";
  if (!hint) return base;
  return base ? `${base} (${hint})` : hint;
}

function stripUnsupportedConstraints(
  node: Record<string, unknown>,
  path: string
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const type = node.type;
  if (typeof type === "string") out.type = type;

  const description = node.description;
  const hints: string[] = [];

  for (const key of UNSUPPORTED_SCALAR_KEYS) {
    if (node[key] !== undefined) {
      hints.push(`${key}: ${String(node[key])}`);
    }
  }

  const minItems = node.minItems;
  if (typeof minItems === "number" && minItems !== 0 && minItems !== 1) {
    hints.push(`minItems: ${minItems}`);
  } else if (minItems === 0 || minItems === 1) {
    out.minItems = minItems;
  }

  if (node.maxItems !== undefined) {
    hints.push(`maxItems: ${String(node.maxItems)}`);
  }

  if (Array.isArray(node.enum)) {
    out.enum = node.enum;
  }

  if (hints.length > 0) {
    out.description = appendDescription(description, hints.join("; "));
  } else if (typeof description === "string" && description.trim()) {
    out.description = description.trim();
  }

  if (type === "object" && isRecord(node.properties)) {
    out.additionalProperties = false;
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.properties)) {
      if (isRecord(value)) {
        props[key] = stripUnsupportedConstraints(value, `${path}.${key}`);
      }
    }
    out.properties = props;
    if (Array.isArray(node.required)) {
      out.required = node.required.filter((k): k is string => typeof k === "string");
    } else {
      out.required = Object.keys(props);
    }
  }

  if (type === "array" && node.items != null) {
    if (isRecord(node.items)) {
      out.items = stripUnsupportedConstraints(node.items, `${path}[]`);
    } else if (typeof node.items === "object") {
      out.items = node.items;
    }
  }

  if (Array.isArray(node.anyOf)) {
    out.anyOf = node.anyOf
      .filter(isRecord)
      .map((child, i) => stripUnsupportedConstraints(child, `${path}.anyOf[${i}]`));
  }
  if (Array.isArray(node.allOf)) {
    out.allOf = node.allOf
      .filter(isRecord)
      .map((child, i) => stripUnsupportedConstraints(child, `${path}.allOf[${i}]`));
  }
  if (Array.isArray(node.oneOf)) {
    out.anyOf = node.oneOf
      .filter(isRecord)
      .map((child, i) => stripUnsupportedConstraints(child, `${path}.oneOf[${i}]`));
  }

  if (isRecord(node.$defs)) {
    const defs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.$defs)) {
      if (isRecord(value)) {
        defs[key] = stripUnsupportedConstraints(value, `${path}.$defs.${key}`);
      }
    }
    out.$defs = defs;
  }

  return out;
}

/** Provider wire schema — canonical schema remains unchanged elsewhere. */
export function transformSchemaForAnthropicToolInput(
  schema: Record<string, unknown>
): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  return stripUnsupportedConstraints(clone, "$");
}
