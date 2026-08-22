/**
 * Deterministic intent classification from natural language + client capability.
 */

import type { BriefIntentKind, BriefRuntimeCapabilityId } from "../contracts/structured-brief";

export interface IntentClassification {
  readonly kind: BriefIntentKind;
  readonly confidence: number;
  readonly rationale: string;
}

function score(prompt: string, patterns: readonly RegExp[]): number {
  let hits = 0;
  for (const p of patterns) {
    if (p.test(prompt)) hits += 1;
  }
  return hits;
}

const RULES: readonly {
  readonly kind: BriefIntentKind;
  readonly patterns: readonly RegExp[];
}[] = [
  {
    kind: "campaign",
    patterns: [
      /\bcampaign\b/i,
      /\bproduct\s+launch\b/i,
      /\bgo[\s-]?to[\s-]?market\b/i,
      /\bgtm\b/i,
    ],
  },
  {
    kind: "landing_page",
    patterns: [/\blanding\s*page\b/i, /\blandingpage\b/i, /\blp\b/i],
  },
  {
    kind: "website",
    patterns: [/\bwebsite\b/i, /\bweb\s*site\b/i, /\bmulti[\s-]?page\b/i],
  },
  {
    kind: "advertisement",
    patterns: [/\bmeta\s*ads?\b/i, /\bfacebook\s*ads?\b/i, /\bad\s*copy\b/i, /\badvert/i],
  },
  {
    kind: "social_content",
    patterns: [
      /\binstagram\b/i,
      /\btiktok\b/i,
      /\blinkedin\b/i,
      /\btwitter\b/i,
      /\bx\.com\b/i,
      /\bsocial\s*(media|post|content|caption)\b/i,
      /\bcaption\b/i,
    ],
  },
  {
    kind: "image",
    patterns: [/\bimage\b/i, /\blogo\b/i, /\billustration\b/i, /\bvisual\b/i, /\bphoto\b/i],
  },
  {
    kind: "video",
    patterns: [/\bvideo\b/i, /\breel\b/i, /\bshort[\s-]?form\b/i, /\banimation\b/i],
  },
  {
    kind: "audio",
    patterns: [/\baudio\b/i, /\bvoiceover\b/i, /\btts\b/i, /\btranscri/i, /\bpodcast\b/i],
  },
  {
    kind: "research",
    patterns: [/\bresearch\b/i, /\bcompetitor\b/i, /\bmarket\s*analysis\b/i],
  },
  {
    kind: "analysis",
    patterns: [/\banaly[sz]e\b/i, /\banalysis\b/i, /\breview\b/i],
  },
  {
    kind: "document",
    patterns: [/\bdocument\b/i, /\breport\b/i, /\bwhitepaper\b/i, /\bpitch\s*deck\b/i],
  },
  {
    kind: "copy",
    patterns: [
      /\bcopy\b/i,
      /\btagline\b/i,
      /\bheadline\b/i,
      /\bwrite\b/i,
      /\bblog\b/i,
      /\blaunch\b/i,
      /\bfor\s+(gen\s*z|millennials?)\b/i,
    ],
  },
  {
    kind: "embedding",
    patterns: [/\bembed/i, /\bvector\b/i],
  },
];

const CAPABILITY_TO_INTENT: Readonly<
  Record<BriefRuntimeCapabilityId, BriefIntentKind>
> = {
  "text.generate": "copy",
  "text.chat": "copy",
  "reasoning.analyze": "analysis",
  "image.generate": "image",
  "vision.analyze": "analysis",
  "video.generate": "video",
  "audio.synthesize": "audio",
  "audio.transcribe": "audio",
  "embedding.generate": "embedding",
};

/**
 * Services that are inherently text/strategy-based.
 * When the user has selected one of these, the intent must always be text-based
 * regardless of media keywords that appear in the prompt.
 * e.g. "strategy for Instagram Reels" mentions "reel" but the deliverable is
 * a written strategy document, not a video.
 */
const TEXT_ONLY_SERVICES: ReadonlySet<string> = new Set([
  "strategy",
  "copywriting",
  "content-design",
  "content_design",
  "research",
  "analysis",
  "consulting",
  "seo",
  "email",
  "email-marketing",
  "email_marketing",
  "pr",
  "public-relations",
  "public_relations",
]);

/**
 * Intent kinds that are always safe for text-only services.
 * Any other classified intent gets overridden to "copy" when a text-only service is active.
 */
const TEXT_SAFE_INTENTS: ReadonlySet<BriefIntentKind> = new Set([
  "copy",
  "campaign",
  "social_content",
  "research",
  "analysis",
  "document",
  "other",
]);

function isTextOnlyService(productService?: string): boolean {
  if (!productService) return false;
  const normalized = productService.trim().toLowerCase();
  if (TEXT_ONLY_SERVICES.has(normalized)) return true;
  // Also catch compound values like "social/strategy"
  return normalized.split(/[\s/_-]/).some((part) => TEXT_ONLY_SERVICES.has(part));
}

export function classifyBriefIntent(input: {
  readonly prompt: string;
  readonly clientCapabilityId?: string;
  readonly productService?: string;
}): IntentClassification {
  const prompt = input.prompt.trim();
  const isTextOnly = isTextOnlyService(input.productService);

  // Hard lock: text-only services must never route to media generation.
  // Check capability first — if the client explicitly requested text, honour it.
  const cap = input.clientCapabilityId?.trim() as BriefRuntimeCapabilityId | undefined;
  if (isTextOnly) {
    const capIntent = cap ? CAPABILITY_TO_INTENT[cap] : undefined;
    // Allow the cap-derived intent only if it's text-safe, otherwise force "copy".
    const lockedIntent: BriefIntentKind =
      capIntent && TEXT_SAFE_INTENTS.has(capIntent) ? capIntent : "copy";
    return {
      kind: lockedIntent,
      confidence: 0.97,
      rationale: `Service "${input.productService}" is text-only — intent locked to "${lockedIntent}" regardless of media keywords in prompt`,
    };
  }

  const scored = RULES.map((r) => ({
    kind: r.kind,
    hits: score(prompt, r.patterns),
  }))
    .filter((r) => r.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  // Multi-signal campaign: campaign + (landing|social|ads)
  const hasCampaign = scored.some((s) => s.kind === "campaign");
  const hasMarketingAssets = scored.some((s) =>
    ["landing_page", "social_content", "advertisement", "image", "video"].includes(
      s.kind
    )
  );
  if (hasCampaign && hasMarketingAssets) {
    return {
      kind: "campaign",
      confidence: Math.min(0.98, 0.75 + scored[0]!.hits * 0.08),
      rationale: "Campaign + multi-channel deliverable signals",
    };
  }

  // Explicit caption / short social — prefer social_content over generic copy.
  if (/\bcaption\b/i.test(prompt)) {
    return {
      kind: "social_content",
      confidence: 0.88,
      rationale: "Explicit caption request",
    };
  }

  if (scored[0]) {
    const top = scored[0];
    const second = scored[1];
    const ambiguous =
      second && second.hits === top.hits && top.kind !== second.kind;
    // Prefer more specific marketing intents when tied.
    const specificity: Partial<Record<BriefIntentKind, number>> = {
      campaign: 10,
      landing_page: 9,
      website: 8,
      advertisement: 7,
      social_content: 6,
      video: 5,
      image: 4,
      copy: 3,
      other: 0,
    };
    const preferred =
      ambiguous && second
        ? (specificity[top.kind] ?? 1) >= (specificity[second.kind] ?? 1)
          ? top
          : second
        : top;
    return {
      kind: preferred.kind,
      confidence: ambiguous
        ? Math.min(0.72, 0.58 + preferred.hits * 0.08)
        : Math.min(0.95, 0.6 + preferred.hits * 0.12),
      rationale: ambiguous
        ? `Resolved tie between ${top.kind} and ${second!.kind} → ${preferred.kind}`
        : `Matched ${preferred.hits} pattern(s) for ${preferred.kind}`,
    };
  }

  if (cap && CAPABILITY_TO_INTENT[cap]) {
    return {
      kind: CAPABILITY_TO_INTENT[cap],
      confidence: 0.7,
      rationale: `Derived from client capability ${cap}`,
    };
  }

  return {
    kind: "other",
    confidence: 0.4,
    rationale: "No strong intent patterns; defaulting to other",
  };
}
