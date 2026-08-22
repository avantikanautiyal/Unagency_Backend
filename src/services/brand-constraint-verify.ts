/**
 * V1 — Verify → reinforce (Brand compounding close-loop)
 *
 * Cheap post-gen constraint check against locked brand colors / avoid terms.
 * - Pass + high confidence → reinforce product brand preferences (async)
 * - Fail → do not promote junk knowledge (caller skips index); attach fix directive
 *
 * Performance: sync regex only; reinforce is fire-and-forget. No second model call.
 */

import { mergePreferencesIntoProductBrand } from "../platform/business/brand-brain/learning/product-brand-preference-writer";

const HEX_RE = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;

export type BrandConstraintVerifyInput = {
  readonly organizationId: string;
  readonly brandId?: string;
  readonly lockedColors?: readonly string[];
  readonly brandTone?: string;
  readonly brandAvoidTerms?: readonly string[];
  readonly prompt?: string;
  readonly outputText?: string;
  readonly productAction?: string;
};

export type BrandConstraintVerifyResult = {
  readonly checked: boolean;
  readonly passed: boolean;
  readonly confidence: number;
  readonly score: number;
  readonly findings: readonly string[];
  /** Inject into next refine / retry prompt when failed. */
  readonly fixDirective?: string;
  readonly reinforced?: boolean;
};

function normalizeHex(token: string): string {
  const t = token.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(t)) {
    const r = t[1]!;
    const g = t[2]!;
    const b = t[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return t;
}

function extractHexColors(...texts: Array<string | undefined>): string[] {
  const out = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    HEX_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HEX_RE.exec(text))) {
      out.add(normalizeHex(m[0]!));
    }
  }
  return [...out];
}

const SKIP_ACTIONS = new Set([
  "enhance_prompt",
  "route_visual",
  "task_graph_leaf",
]);

/**
 * Soft brand constraint verify. Safe to call on every successful create.
 */
export async function verifyAndReinforceBrandConstraints(
  input: BrandConstraintVerifyInput
): Promise<BrandConstraintVerifyResult> {
  if (input.productAction && SKIP_ACTIONS.has(input.productAction)) {
    return {
      checked: false,
      passed: true,
      confidence: 0,
      score: 1,
      findings: ["skipped_thin_action"],
    };
  }

  const locked = (input.lockedColors ?? [])
    .map((c) => c.trim())
    .filter(Boolean);
  const lockedHex = locked
    .filter((c) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c))
    .map(normalizeHex);
  const avoid = (input.brandAvoidTerms ?? [])
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2);

  const output = (input.outputText ?? "").trim();
  const prompt = (input.prompt ?? "").trim();
  const hay = `${prompt}\n${output}`.toLowerCase();

  if (!lockedHex.length && !avoid.length && !input.brandTone?.trim()) {
    return {
      checked: false,
      passed: true,
      confidence: 0,
      score: 1,
      findings: ["no_constraints"],
    };
  }

  const findings: string[] = [];
  let score = 1;

  // Color check: when locked hex exist and output is textual, look for palette mention
  // or at least no conflicting random hex spam. Images can't be pixel-checked here.
  const outputHex = extractHexColors(output);
  if (lockedHex.length && output.length > 40) {
    if (outputHex.length) {
      const hits = lockedHex.filter((c) => outputHex.includes(c));
      if (hits.length === 0) {
        findings.push("output_hex_misses_locked_palette");
        score -= 0.35;
      } else {
        findings.push(`palette_hex_matched:${hits.length}`);
      }
    } else {
      // Soft: text output without hex is OK if prompt locked colors (visual path).
      findings.push("no_output_hex_to_verify");
    }
  }

  for (const term of avoid) {
    if (hay.includes(term)) {
      findings.push(`avoid_term_present:${term}`);
      score -= 0.25;
    }
  }

  score = Math.max(0, Math.min(1, score));
  const passed = score > 0.65;
  const confidence =
    lockedHex.length || avoid.length ? (output.length > 40 ? 0.75 : 0.45) : 0.3;

  let fixDirective: string | undefined;
  if (!passed) {
    const parts: string[] = [];
    if (lockedHex.length) {
      parts.push(
        `Respect locked brand palette exactly: ${lockedHex.join(", ")}. Do not invent alternate theme colors.`
      );
    }
    if (avoid.length) {
      parts.push(`Avoid these brand terms: ${avoid.join(", ")}.`);
    }
    if (input.brandTone?.trim()) {
      parts.push(`Keep brand tone: ${input.brandTone.trim()}.`);
    }
    fixDirective = parts.join(" ");
  }

  let reinforced = false;
  if (passed && confidence >= 0.7 && lockedHex.length) {
    try {
      // Skip reinforce when Mongo isn't connected (unit tests / cold boot).
      const mongoose = await import("mongoose");
      if (mongoose.default.connection.readyState === 1) {
        const result = await mergePreferencesIntoProductBrand({
          organizationId: input.organizationId,
          brandId: input.brandId,
          preferences: { colors: lockedHex },
          source: "verify_reinforce",
        });
        reinforced = result.updated === true;
        if (reinforced) findings.push("reinforced_product_brand");
      } else {
        findings.push("reinforce_deferred_no_mongo");
      }
    } catch {
      findings.push("reinforce_failed");
    }
  }

  return {
    checked: true,
    passed,
    confidence,
    score,
    findings,
    fixDirective,
    reinforced,
  };
}

/** Fire-and-forget wrapper — never throws. */
export function scheduleVerifyAndReinforceBrandConstraints(
  input: BrandConstraintVerifyInput
): void {
  void verifyAndReinforceBrandConstraints(input).catch(() => {
    /* non-fatal */
  });
}
