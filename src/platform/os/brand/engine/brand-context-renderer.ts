/**
 * Deterministic BrandContext → model context string (provider-agnostic).
 * Brand Intelligence never builds vendor-specific prompts.
 */

import type { BrandContext } from "../contracts/brand-context";

function push(lines: string[], label: string, value: string | undefined): void {
  const v = value?.trim();
  if (v) lines.push(`${label}: ${v}`);
}

function pushList(lines: string[], label: string, values: readonly string[] | undefined): void {
  if (!values?.length) return;
  lines.push(`${label}: ${values.join(", ")}`);
}

/** True when BrandContext has content worth injecting into the provider prompt. */
export function brandContextHasSignal(ctx: BrandContext): boolean {
  if (ctx.status === "MISSING" || ctx.status === "EMPTY") return false;
  if (ctx.status === "FAILED" || ctx.status === "INVALID") return false;
  return Boolean(
    ctx.identity.name?.trim() ||
      ctx.tone.tone?.trim() ||
      ctx.voice.voice?.trim() ||
      ctx.visualIdentity.colors?.length ||
      ctx.visualIdentity.primaryColors?.length ||
      ctx.vocabulary.avoid?.length ||
      ctx.positioning.statement?.trim() ||
      ctx.messaging.guidelines?.trim() ||
      ctx.prohibitedPatterns.length
  );
}

/** Renders structured BrandContext into a compact, inspectable text block. */
export function renderBrandContextBlock(ctx: BrandContext): string {
  // Empty/missing contexts are not rendered into prompts (signal-or-silence).
  // Keep a compact debug string for tests/inspect only — composeBrandAwarePrompt skips these.
  if (ctx.status === "MISSING" || ctx.status === "EMPTY") {
    return [
      "[Structured Brand Context — unbranded]",
      `status=${ctx.status}`,
      `organizationId=${ctx.organizationId}`,
      ctx.brandId ? `brandId=${ctx.brandId}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const lines: string[] = [
    "[Structured Brand Context — authoritative]",
    `brandId=${ctx.brandId ?? "n/a"}`,
    `brandVersion=${ctx.brandVersion}`,
    `status=${ctx.status}`,
    `completeness=${ctx.completeness.overall}`,
    `contextHash=${ctx.contextHash}`,
  ];

  push(lines, "Brand name", ctx.identity.name);
  // Lead with generation-critical palette + voice so theme survives truncation.
  pushList(lines, "Colors", ctx.visualIdentity.colors);
  pushList(lines, "Primary colors", ctx.visualIdentity.primaryColors);
  pushList(lines, "Secondary colors", ctx.visualIdentity.secondaryColors);
  push(lines, "Tone", ctx.tone.tone);
  pushList(lines, "Tone adjectives", ctx.tone.adjectives);
  push(lines, "Voice", ctx.voice.voice);
  push(lines, "Personality", ctx.voice.personality);
  push(lines, "Writing style", ctx.voice.writingStyle);
  push(lines, "Mission", ctx.identity.mission);
  push(lines, "Vision", ctx.identity.vision);
  push(lines, "Industry", ctx.identity.industry);
  push(lines, "Positioning", ctx.positioning.statement);
  push(lines, "Audience", ctx.audience.primary);
  pushList(lines, "Preferred vocabulary", ctx.vocabulary.preferred);
  pushList(lines, "Words to avoid", ctx.vocabulary.avoid);
  push(lines, "Messaging guidelines", ctx.messaging.guidelines);
  push(lines, "CTA style", ctx.messaging.ctaStyle ?? ctx.ctaRules);
  push(lines, "Formatting", ctx.messaging.formattingRules);
  push(lines, "Emoji policy", ctx.messaging.emojiPolicy);
  push(lines, "Typography", ctx.visualIdentity.typography);
  push(lines, "Logo rules", ctx.visualIdentity.logoRules);
  push(lines, "Photography", ctx.visualIdentity.photographyStyle);
  push(lines, "Illustration", ctx.visualIdentity.illustrationStyle);
  push(lines, "Social visual style", ctx.visualIdentity.socialStyle);
  push(lines, "AI rules", ctx.creativePrinciples.aiRules);
  pushList(lines, "Prohibited", ctx.prohibitedPatterns);
  pushList(lines, "Preferred patterns", ctx.preferredPatterns);

  if (ctx.assetReferences.length) {
    lines.push(
      `Assets: ${ctx.assetReferences
        .map((a) => `${a.type}:${a.assetId}${a.name ? `(${a.name})` : ""}`)
        .join("; ")}`
    );
  }

  if (ctx.missingInformation.length) {
    lines.push(
      `Missing brand fields: ${ctx.missingInformation.map((m) => m.key).join(", ")}`
    );
  }

  return lines.join("\n");
}

/**
 * Merge Brand Context into the provider prompt.
 * Signal-or-silence: EMPTY / MISSING / no usable fields → leave prompt unchanged
 * (no “do not invent brand” tax that fights the user brief).
 */
export function composeBrandAwarePrompt(
  existingPrompt: string,
  ctx: BrandContext
): string {
  const base = existingPrompt.trim();
  if (!brandContextHasSignal(ctx)) {
    return base;
  }

  const block = renderBrandContextBlock(ctx);
  const signal = `[Brand name=${ctx.identity.name ?? "unspecified"} tone=${ctx.tone.tone ?? "unspecified"} id=${ctx.brandId ?? "n/a"}]`;

  if (!base) return `${signal}\n${block}`;
  if (base.includes("[Structured Brand Context") || base.startsWith("[Brand ")) {
    return base;
  }

  const briefIdx = base.indexOf("[Structured Brief");
  if (briefIdx >= 0) {
    const before = base.slice(0, briefIdx).trimEnd();
    const after = base.slice(briefIdx);
    return `${signal}\n${before}\n\n${block}\n\n${after}`;
  }
  return `${signal}\n${base}\n\n${block}`;
}
