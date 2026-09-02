/**
 * Priority 4.8 — Requirement enforcement classification & negative constraint handling.
 */

import type { RequirementSource } from "./conversational-task-contract";
import type {
  BrandAssetRequirementSpec,
  NegativeConstraintSpec,
  RequirementEnforcement,
  ResolvedField,
  SpecFieldProvenance,
} from "./execution-specification";
import { explicitField, field } from "./execution-specification";

export type {
  RequirementEnforcement,
  NegativeConstraintSpec,
  BrandAssetRequirementSpec,
} from "./execution-specification";

export function normalizeNegativeConcept(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function negativeConstraintSpec(
  subject: string,
  source: RequirementSource = "EXPLICIT_USER",
  enforcement: RequirementEnforcement = "HARD_CONSTRAINT",
): NegativeConstraintSpec {
  return Object.freeze({
    subject: subject.trim(),
    normalizedConcept: normalizeNegativeConcept(subject),
    enforcement,
  });
}

export function resolvedNegativeConstraint(
  spec: NegativeConstraintSpec,
  source: RequirementSource = "EXPLICIT_USER",
  explicit = true,
): ResolvedField<NegativeConstraintSpec> {
  return explicit
    ? explicitField(spec, source)
    : field(spec, source, false);
}

const NEGATIVE_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly group: number;
}> = [
  {
    pattern:
      /\b(?:do not|don't|never|not)\s+use\s+(.+?)(?:[.!?,]|$|\b(?:please|and|but)\b)/i,
    group: 1,
  },
  {
    pattern:
      /\b(?:do not|don't|never|not)\s+include\s+(.+?)(?:[.!?,]|$|\b(?:please|and|but)\b)/i,
    group: 1,
  },
  {
    pattern:
      /\b(?:without|exclude|omit|avoid)\s+(?:using\s+)?(.+?)(?:[.!?,]|$|\b(?:please|and|but)\b)/i,
    group: 1,
  },
  {
    pattern:
      /\bno\s+(.+?)(?:\s+icons?|\s+symbols?|\s+imagery|\s+elements?)?(?:[.!?,]|$|\b(?:please|and|but)\b)/i,
    group: 1,
  },
  {
    pattern:
      /\b(?:specifically\s+(?:said|mentioned|requested)\s+)?no\s+(.+?)(?:[.!?,]|$)/i,
    group: 1,
  },
  {
    pattern:
      /\b(?:do not|don't)\s+(?:generate|regenerate|modify|change)\s+(?:the\s+)?(.+?)(?:[.!?,]|$)/i,
    group: 1,
  },
];

const VAULT_LOGO_PATTERNS =
  /\b(?:use|from)\s+(?:the\s+)?(?:brand\s+)?(?:vault\s+)?logo\b|\blogo\s+from\s+(?:the\s+)?(?:brand\s+)?vault\b/i;

const SOFT_STYLE_MARKERS =
  /\b(premium|minimal|modern|editorial|bold|soft|elegant|playful|professional)\b/i;

export function extractNegativeConstraintsFromMessage(
  message: string,
): readonly NegativeConstraintSpec[] {
  const text = message.trim();
  if (!text) return Object.freeze([]);
  const found = new Map<string, NegativeConstraintSpec>();

  for (const { pattern, group } of NEGATIVE_PATTERNS) {
    const match = text.match(pattern);
    if (!match?.[group]) continue;
    let subject = match[group]!.trim();
    subject = subject.replace(/\b(please|again|properly|in the design|in this)\b.*$/i, "").trim();
    if (subject.length < 2 || subject.length > 120) continue;
    if (/^(it|this|that|them)$/i.test(subject)) continue;
    const spec = negativeConstraintSpec(subject);
    found.set(spec.normalizedConcept, spec);
  }

  if (/\bno\s+cta\b|\bwithout\s+(?:a\s+)?cta\b/i.test(text)) {
    const spec = negativeConstraintSpec("CTA");
    found.set(spec.normalizedConcept, spec);
  }

  return Object.freeze([...found.values()]);
}

export function extractBrandAssetRequirementFromMessage(
  message: string,
): BrandAssetRequirementSpec | undefined {
  if (!VAULT_LOGO_PATTERNS.test(message)) return undefined;
  return Object.freeze({
    assetId: "",
    role: "logo",
    required: true,
  });
}

export function classifyStyleRequirement(value: string): RequirementEnforcement {
  return SOFT_STYLE_MARKERS.test(value) ? "SOFT_PREFERENCE" : "HARD_CONSTRAINT";
}

export function mergeNegativeConstraints(input: {
  readonly prior?: readonly ResolvedField<NegativeConstraintSpec>[];
  readonly extracted?: readonly NegativeConstraintSpec[];
  readonly reversedConcepts?: readonly string[];
}): readonly NegativeConstraintSpec[] {
  const byConcept = new Map<string, NegativeConstraintSpec>();

  for (const prior of input.prior ?? []) {
    byConcept.set(prior.value.normalizedConcept, prior.value);
  }
  for (const extracted of input.extracted ?? []) {
    byConcept.set(extracted.normalizedConcept, extracted);
  }
  for (const reversed of input.reversedConcepts ?? []) {
    byConcept.delete(normalizeNegativeConcept(reversed));
    if (reversed.toLowerCase().includes("green")) {
      byConcept.delete("green");
      byConcept.delete("no_green");
    }
  }

  return Object.freeze([...byConcept.values()]);
}

export function detectReversedNegativeConcepts(message: string): readonly string[] {
  const reversed: string[] = [];
  const useGreen = message.match(
    /\b(?:use|with|add|include)\s+(?:green|green accents?)\b/i,
  );
  if (useGreen) reversed.push("green", "no green");
  const allowMatch = message.match(/\b(?:allow|include|use)\s+(.+?)(?:[.!?,]|$)/i);
  if (allowMatch?.[1] && /\bactually\b/i.test(message)) {
    reversed.push(allowMatch[1].trim());
  }
  return Object.freeze(reversed);
}

export function negativeConstraintInstruction(
  constraints: readonly NegativeConstraintSpec[],
): readonly string[] {
  return Object.freeze(
    constraints.map((c) => {
      if (c.enforcement === "HARD_CONSTRAINT") {
        return `HARD CONSTRAINT — Do NOT include ${c.subject}.`;
      }
      return `Avoid: ${c.subject}.`;
    }),
  );
}

export function formatNegativeConstraintForProvider(
  constraints: readonly NegativeConstraintSpec[],
): string {
  const lines = negativeConstraintInstruction(constraints);
  if (!lines.length) return "";
  return ["[User requirements — negative constraints]", ...lines].join("\n");
}

export function constraintObservabilitySummary(
  constraints: readonly NegativeConstraintSpec[],
): Readonly<Record<string, unknown>> {
  const hard = constraints.filter((c) => c.enforcement === "HARD_CONSTRAINT");
  const soft = constraints.filter((c) => c.enforcement === "SOFT_PREFERENCE");
  return Object.freeze({
    negativeConstraintCount: constraints.length,
    hardConstraintCount: hard.length,
    softPreferenceCount: soft.length,
    negativeConstraintConcepts: constraints.map((c) => c.normalizedConcept),
    hardConstraintConcepts: hard.map((c) => c.normalizedConcept),
  });
}

export function provenanceSummary(
  fields: ReadonlyArray<{ readonly provenance: SpecFieldProvenance }>,
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const f of fields) {
    const key = f.provenance.source;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.freeze(counts);
}
