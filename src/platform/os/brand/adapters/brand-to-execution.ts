/**
 * Adapt BrandContext → execution metadata (no secrets).
 */

import type { BrandContext } from "../contracts/brand-context";

export function brandContextToMetadata(
  ctx: BrandContext
): Readonly<Record<string, unknown>> {
  return {
    structuredBrandContext: ctx,
    brandContextId: ctx.id,
    brandContextStatus: ctx.status,
    brandContextHash: ctx.contextHash,
    brandId: ctx.brandId,
    brandVersion: ctx.brandVersion,
    brandCompleteness: ctx.completeness.overall,
    brandTone: ctx.tone.tone,
    brandVoice: ctx.voice.voice,
    styleInstructions: [
      ctx.tone.tone ? `Tone: ${ctx.tone.tone}` : "",
      ctx.voice.voice ? `Voice: ${ctx.voice.voice}` : "",
      ctx.voice.writingStyle ? `Writing style: ${ctx.voice.writingStyle}` : "",
      ctx.positioning.statement ? `Positioning: ${ctx.positioning.statement}` : "",
      ctx.messaging.ctaStyle ? `CTA style: ${ctx.messaging.ctaStyle}` : "",
    ]
      .filter(Boolean)
      .join(". "),
    negativeInstructions: ctx.prohibitedPatterns.map((p) => `Avoid: ${p}`),
  };
}
