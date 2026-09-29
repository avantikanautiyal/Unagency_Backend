/**
 * Generic production-actionable creative-direction semantics.
 *
 * Shared vocabulary + registry-declared capability applicability.
 * No serviceId / phaseId / platform branches in the compiler.
 */

/** Optional production fields — not every direction must populate every key. */
export const CREATIVE_DIRECTION_PRODUCTION_FIELD_KEYS = [
  "communicationObjective",
  "primaryMessage",
  "secondaryMessage",
  "visualConcept",
  "focalPoint",
  "composition",
  "hierarchy",
  "typographyDirection",
  "supportingVisualElements",
  "brandIntegration",
  "identityMarkRole",
  "audienceSignal",
  "useContextIntent",
  "avoidances",
] as const;

export type CreativeDirectionProductionFieldKey =
  (typeof CREATIVE_DIRECTION_PRODUCTION_FIELD_KEYS)[number];

export type CreativeDirectionProductionFields = {
  readonly [K in CreativeDirectionProductionFieldKey]?: string;
};

/**
 * Declarative capability groups — registry phases opt into which production
 * semantics apply. Field sets are derived from capabilities, not service ids.
 */
export type CreativeDirectionProductionCapability =
  | "communication"
  | "visual"
  | "hierarchy"
  | "brand"
  | "audience"
  | "context"
  | "constraints";

export type CreativeDirectionProductionSemantics = {
  readonly communication?: boolean;
  readonly visual?: boolean;
  readonly hierarchy?: boolean;
  readonly brand?: boolean;
  readonly audience?: boolean;
  readonly context?: boolean;
  readonly constraints?: boolean;
};

export const PRODUCTION_SEMANTICS_CAPABILITY_FIELDS: Readonly<
  Record<
    CreativeDirectionProductionCapability,
    readonly CreativeDirectionProductionFieldKey[]
  >
> = {
  communication: [
    "communicationObjective",
    "primaryMessage",
    "secondaryMessage",
  ],
  visual: [
    "visualConcept",
    "focalPoint",
    "composition",
    "supportingVisualElements",
  ],
  hierarchy: ["hierarchy", "typographyDirection"],
  brand: ["brandIntegration", "identityMarkRole"],
  audience: ["audienceSignal"],
  context: ["useContextIntent"],
  constraints: ["avoidances"],
};

/** Full visual-creative production posture (common for image direction phases). */
export const FULL_VISUAL_PRODUCTION_SEMANTICS: CreativeDirectionProductionSemantics =
  Object.freeze({
    communication: true,
    visual: true,
    hierarchy: true,
    brand: true,
    audience: true,
    context: true,
    constraints: true,
  });

/** Conceptual fields shared across creative-direction / routes artifacts. */
export const CREATIVE_DIRECTION_CONCEPT_FIELD_KEYS = [
  "creativeIdea",
  "visualTreatment",
  "headlineAngle",
  "rationale",
  "shelfIdea",
  "visualDirection",
  "designRationale",
  "hierarchyThought",
  "name",
] as const;

const AUTHORITATIVE_DIRECTION_KEYS = [
  "name",
  "routeId",
  "creativeIdea",
  "visualTreatment",
  "headlineAngle",
  "rationale",
  "shelfIdea",
  "visualDirection",
  "designRationale",
  "hierarchyThought",
  ...CREATIVE_DIRECTION_PRODUCTION_FIELD_KEYS,
] as const;

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t ? t : undefined;
}

/** Resolve production field keys enabled by capability declaration. */
export function productionFieldKeysForSemantics(
  semantics?: CreativeDirectionProductionSemantics | null,
): readonly CreativeDirectionProductionFieldKey[] {
  if (!semantics) {
    return CREATIVE_DIRECTION_PRODUCTION_FIELD_KEYS;
  }
  const keys: CreativeDirectionProductionFieldKey[] = [];
  const seen = new Set<string>();
  for (const cap of Object.keys(
    PRODUCTION_SEMANTICS_CAPABILITY_FIELDS,
  ) as CreativeDirectionProductionCapability[]) {
    if (!semantics[cap]) continue;
    for (const field of PRODUCTION_SEMANTICS_CAPABILITY_FIELDS[cap]) {
      if (seen.has(field)) continue;
      seen.add(field);
      keys.push(field);
    }
  }
  return keys;
}

/** Pick optional production fields from a raw structured choice object. */
export function pickCreativeDirectionProductionFields(
  raw: Readonly<Record<string, unknown>>,
): CreativeDirectionProductionFields {
  const out: Record<string, string> = {};
  for (const key of CREATIVE_DIRECTION_PRODUCTION_FIELD_KEYS) {
    const v = asNonEmptyString(raw[key]);
    if (v) out[key] = v;
  }
  return out as CreativeDirectionProductionFields;
}

/**
 * Authoritative creative-direction text for prompts — never character-sliced.
 * Structured fields only; not a raw JSON dump of the whole choice.
 */
export function formatAuthoritativeCreativeDirection(
  choice: Readonly<Record<string, unknown>>,
): string {
  const lines: string[] = [];
  for (const key of AUTHORITATIVE_DIRECTION_KEYS) {
    const v = asNonEmptyString(choice[key]);
    if (!v) continue;
    if (key === "name") {
      lines.push(`Name: ${v}`);
      continue;
    }
    if (key === "routeId") {
      lines.push(`Route id: ${v}`);
      continue;
    }
    lines.push(`${key}: ${v}`);
  }
  const chars = choice.visualCharacteristics;
  if (Array.isArray(chars) && chars.length) {
    const joined = chars
      .filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
      .map((x) => x.trim());
    if (joined.length) {
      lines.push(`visualCharacteristics: ${joined.join("; ")}`);
    }
  }
  return lines.join("\n").trim();
}

/**
 * Compact preview for UI / continuity metadata only.
 * Must never replace the authoritative direction in generation prompts.
 */
export function compactCreativeDirectionSummary(
  choice: Readonly<Record<string, unknown>>,
  maxChars = 280,
): string {
  const name = asNonEmptyString(choice.name);
  const idea =
    asNonEmptyString(choice.creativeIdea) ||
    asNonEmptyString(choice.shelfIdea) ||
    asNonEmptyString(choice.visualTreatment) ||
    asNonEmptyString(choice.visualDirection);
  const base = name && idea ? `${name}: ${idea}` : name || idea || "";
  if (!base) return "";
  if (base.length <= maxChars) return base;
  return `${base.slice(0, Math.max(0, maxChars - 1))}…`;
}

/** JSON Schema property bag for optional production fields (LLM emission). */
export function creativeDirectionProductionSchemaProperties(
  semantics?: CreativeDirectionProductionSemantics | null,
): Record<string, { type: "string" }> {
  const props: Record<string, { type: "string" }> = {};
  for (const key of productionFieldKeysForSemantics(semantics)) {
    props[key] = { type: "string" };
  }
  return props;
}

/**
 * Build a routes[] structured-emission schema from concept required fields +
 * capability-gated production properties. Generic — no service branches.
 */
export function buildCreativeDirectionRoutesSchema(input: {
  readonly requiredConceptFields: readonly string[];
  readonly optionalConceptFields?: readonly string[];
  readonly productionSemantics?: CreativeDirectionProductionSemantics | null;
  readonly minItems?: number;
  readonly maxItems?: number;
}): Record<string, unknown> {
  const properties: Record<string, { type: "string" }> = {};
  for (const key of input.requiredConceptFields) {
    properties[key] = { type: "string" };
  }
  for (const key of input.optionalConceptFields ?? []) {
    if (!properties[key]) properties[key] = { type: "string" };
  }
  Object.assign(
    properties,
    creativeDirectionProductionSchemaProperties(input.productionSemantics),
  );
  const minItems = input.minItems ?? 3;
  const maxItems = input.maxItems ?? 3;
  return {
    type: "object",
    additionalProperties: false,
    required: ["routes"],
    properties: {
      routes: {
        type: "array",
        minItems,
        maxItems,
        items: {
          type: "object",
          additionalProperties: false,
          required: [...input.requiredConceptFields],
          properties,
        },
      },
    },
  };
}
