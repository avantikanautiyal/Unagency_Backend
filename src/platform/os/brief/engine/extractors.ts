/**
 * Deliverable / requirement / constraint / capability extraction — deterministic.
 */

import type {
  BriefAssumption,
  BriefCapabilityRequirement,
  BriefConstraint,
  BriefDeliverable,
  BriefDeliverableType,
  BriefIntentKind,
  BriefMissingInformation,
  BriefProvenanceEntry,
  BriefRequirement,
  BriefRuntimeCapabilityId,
  BriefAvailableContext,
} from "../contracts/structured-brief";
import { isBriefRuntimeCapabilityId } from "../validation/validate-brief";

function qty(prompt: string, noun: RegExp): number | undefined {
  const m = prompt.match(new RegExp(`(\\d{1,3})\\s+${noun.source}`, "i"));
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? n : undefined;
}

function dim(prompt: string): string | undefined {
  const m = prompt.match(/\b(\d{3,4})\s*[x×]\s*(\d{3,4})\b/i);
  return m ? `${m[1]}x${m[2]}` : undefined;
}

export function extractChannels(prompt: string, ctx?: BriefAvailableContext): string[] {
  const channels = new Set<string>();
  if (ctx?.platform) channels.add(String(ctx.platform).toLowerCase());
  const map: Array<[RegExp, string]> = [
    [/\binstagram\b/i, "instagram"],
    [/\bmeta\b/i, "meta"],
    [/\bfacebook\b/i, "facebook"],
    [/\btiktok\b/i, "tiktok"],
    [/\blinkedin\b/i, "linkedin"],
    [/\byoutube\b/i, "youtube"],
    [/\btwitter\b|\bx\b/i, "x"],
    [/\blanding\s*page\b/i, "web"],
    [/\bwebsite\b/i, "web"],
  ];
  for (const [re, ch] of map) {
    if (re.test(prompt)) channels.add(ch);
  }
  return [...channels];
}

export function extractAudience(prompt: string): string | undefined {
  const m =
    prompt.match(/\bfor\s+(gen\s*z|millennials?|gen\s*y|gen\s*x|boomers?)\b/i) ||
    prompt.match(/\baudience\s*[:=]\s*([^.,;\n]+)/i) ||
    prompt.match(/\btarget(?:ing)?\s+([^.,;\n]{3,60})/i);
  return m?.[1]?.trim();
}

export function extractTone(prompt: string): string | undefined {
  const withWord = prompt.match(
    /\b(premium|playful|professional|energetic|minimal|luxury|friendly)\s+tone\b/i
  );
  if (withWord?.[1]) return withWord[1].toLowerCase();
  const labeled = prompt.match(/\btone\s*[:=]\s*([^.,;\n]+)/i);
  return labeled?.[1]?.trim();
}

export function extractDeliverables(input: {
  readonly prompt: string;
  readonly intent: BriefIntentKind;
  readonly channels: readonly string[];
  readonly createId: (prefix: string) => string;
}): {
  readonly deliverables: BriefDeliverable[];
  readonly provenance: BriefProvenanceEntry[];
} {
  const prompt = input.prompt;
  const deliverables: BriefDeliverable[] = [];
  const provenance: BriefProvenanceEntry[] = [];
  const add = (
    type: BriefDeliverableType,
    description: string,
    opts?: Partial<BriefDeliverable>
  ) => {
    const id = input.createId(`deliv_${type}`);
    deliverables.push({
      id,
      type,
      description,
      required: opts?.required ?? true,
      quantity: opts?.quantity,
      channel: opts?.channel,
      dependencies: opts?.dependencies,
      expectedOutputType: opts?.expectedOutputType ?? type,
      provenance: "USER",
    });
    provenance.push({
      field: `deliverable.${type}`,
      value: description,
      source: "USER",
    });
  };

  const igQty = qty(prompt, /instagram\s+(posts?|carousels?|stories|reels?)/i) ??
    (/\binstagram\b/i.test(prompt) ? qty(prompt, /posts?/i) : undefined);
  if (/\binstagram\b/i.test(prompt) || input.channels.includes("instagram")) {
    add("instagram_content", "Instagram content", {
      quantity: igQty,
      channel: "instagram",
      expectedOutputType: "social_post",
    });
  }

  if (/\bmeta\s*ads?\b/i.test(prompt) || /\bfacebook\s*ads?\b/i.test(prompt)) {
    add("meta_ad_copy", "Meta / Facebook ad copy", {
      channel: "meta",
      expectedOutputType: "ad_copy",
    });
  }

  if (/\blanding\s*page\b/i.test(prompt)) {
    add("landing_page", "Landing page", {
      channel: "web",
      expectedOutputType: "landing_page",
    });
  }

  if (/\bwebsite\b/i.test(prompt) && !/\blanding\s*page\b/i.test(prompt)) {
    add("website", "Website", { channel: "web", expectedOutputType: "website" });
  }

  if (/\bcampaign\b/i.test(prompt) || input.intent === "campaign") {
    add("campaign_strategy", "Campaign strategy / creative routes", {
      expectedOutputType: "campaign_plan",
    });
  }

  if (/\bcaption\b/i.test(prompt)) {
    add("caption", "Social caption", {
      channel: input.channels[0],
      expectedOutputType: "caption",
    });
  }

  if (/\b(image|logo|illustration|visual)\b/i.test(prompt) && input.intent === "image") {
    add("image", "Generated image", { expectedOutputType: "image" });
  }
  if (/\bvideo\b/i.test(prompt) && (input.intent === "video" || /\bgenerate\b/i.test(prompt))) {
    add("video", "Generated video", { expectedOutputType: "video" });
  }

  if (deliverables.length === 0) {
    const fallbackType: BriefDeliverableType =
      input.intent === "image"
        ? "image"
        : input.intent === "video"
          ? "video"
          : input.intent === "landing_page"
            ? "landing_page"
            : input.intent === "website"
              ? "website"
              : input.intent === "social_content"
                ? "social_post"
                : input.intent === "campaign"
                  ? "campaign_strategy"
                  : input.intent === "embedding"
                    ? "embedding"
                    : "copy";
    add(fallbackType, `Primary deliverable for intent=${input.intent}`, {
      expectedOutputType: fallbackType,
    });
  }

  return { deliverables, provenance };
}

export function extractRequirementsAndConstraints(input: {
  readonly prompt: string;
  readonly audience?: string;
  readonly tone?: string;
  readonly dimensions?: string;
}): {
  readonly requirements: BriefRequirement[];
  readonly constraints: BriefConstraint[];
  readonly preferences: BriefRequirement[];
  readonly provenance: BriefProvenanceEntry[];
} {
  const requirements: BriefRequirement[] = [];
  const constraints: BriefConstraint[] = [];
  const preferences: BriefRequirement[] = [];
  const provenance: BriefProvenanceEntry[] = [];

  if (input.audience) {
    requirements.push({
      key: "audience",
      value: input.audience,
      provenance: "USER",
      confidence: 0.9,
    });
    provenance.push({ field: "audience", value: input.audience, source: "USER", confidence: 0.9 });
  }
  if (input.tone) {
    preferences.push({
      key: "tone",
      value: input.tone,
      provenance: "USER",
      confidence: 0.85,
    });
    provenance.push({ field: "tone", value: input.tone, source: "USER", confidence: 0.85 });
  }
  if (input.dimensions) {
    constraints.push({
      key: "dimensions",
      value: input.dimensions,
      provenance: "USER",
      explicit: true,
    });
    provenance.push({
      field: "dimensions",
      value: input.dimensions,
      source: "USER",
      confidence: 1,
    });
  }

  const lang = input.prompt.match(/\bin\s+(english|spanish|french|german|hindi|arabic)\b/i);
  if (lang?.[1]) {
    constraints.push({
      key: "language",
      value: lang[1].toLowerCase(),
      provenance: "USER",
      explicit: true,
    });
  }

  return { requirements, constraints, preferences, provenance };
}

/**
 * Services that must never produce media (image/video) as a primary capability.
 * A prompt like "strategy for Instagram Reels" mentions "reel" but the deliverable
 * is written content, not a generated video.
 */
const TEXT_ONLY_SERVICE_PREFIXES: readonly string[] = [
  "strategy",
  "copywriting",
  "content-design",
  "content_design",
  "research",
  "analysis",
  "consulting",
  "seo",
  "email",
  "pr",
  "public-relations",
  "public_relations",
];

function isTextOnlyServiceForCapabilities(productService?: string): boolean {
  if (!productService) return false;
  const normalized = productService.trim().toLowerCase();
  return TEXT_ONLY_SERVICE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(prefix + "/") || normalized.startsWith(prefix + "-") || normalized.includes("/" + prefix)
  );
}

export function mapBriefCapabilities(input: {
  readonly intent: BriefIntentKind;
  readonly deliverables: readonly BriefDeliverable[];
  readonly clientCapabilityId?: string;
  readonly productService?: string;
}): BriefCapabilityRequirement[] {
  const textOnly = isTextOnlyServiceForCapabilities(input.productService);
  const caps = new Map<BriefRuntimeCapabilityId, BriefCapabilityRequirement>();

  const add = (
    capabilityId: BriefRuntimeCapabilityId,
    role: "primary" | "supporting",
    rationale: string
  ) => {
    // For text-only services, media capabilities can only ever be supporting context.
    const effectiveRole: "primary" | "supporting" =
      textOnly && (capabilityId === "video.generate" || capabilityId === "image.generate")
        ? "supporting"
        : role;
    const existing = caps.get(capabilityId);
    if (!existing) {
      caps.set(capabilityId, { capabilityId, role: effectiveRole, rationale });
      return;
    }
    if (existing.role === "supporting" && effectiveRole === "primary") {
      caps.set(capabilityId, { capabilityId, role: effectiveRole, rationale });
    }
  };

  if (input.clientCapabilityId && isBriefRuntimeCapabilityId(input.clientCapabilityId)) {
    // For text-only services, only add client capability if it's also text-based.
    const clientCap = input.clientCapabilityId as BriefRuntimeCapabilityId;
    const clientIsMedia = clientCap === "video.generate" || clientCap === "image.generate";
    if (!textOnly || !clientIsMedia) {
      add(clientCap, "primary", `Client-requested capability ${clientCap}`);
    }
  }

  // For text-only services, always ensure text.generate is added as primary.
  if (textOnly) {
    add("text.generate", "primary", `Text-only service "${input.productService}" — text.generate is always primary`);
  }

  const types = new Set(input.deliverables.map((d) => d.type));
  const needsText =
    types.has("campaign_strategy") ||
    types.has("landing_page") ||
    types.has("website") ||
    types.has("instagram_content") ||
    types.has("social_post") ||
    types.has("meta_ad_copy") ||
    types.has("caption") ||
    types.has("copy") ||
    types.has("ad_creative") ||
    ["campaign", "copy", "social_content", "landing_page", "website", "advertisement", "research", "analysis", "document", "other"].includes(
      input.intent
    );

  if (needsText) {
    const role =
      input.clientCapabilityId && input.clientCapabilityId !== "text.generate"
        ? "supporting"
        : "primary";
    add("text.generate", role, "Text/copy deliverables");
  }
  if (!textOnly && (types.has("image") || input.intent === "image")) {
    const role =
      input.clientCapabilityId === "image.generate" || input.intent === "image"
        ? "primary"
        : "supporting";
    add("image.generate", role, "Image deliverable");
  }
  if (!textOnly && (types.has("video") || input.intent === "video")) {
    const role =
      input.clientCapabilityId === "video.generate" || input.intent === "video"
        ? "primary"
        : "supporting";
    add("video.generate", role, "Video deliverable");
  }
  if (input.intent === "audio") {
    add(
      input.clientCapabilityId === "audio.transcribe"
        ? "audio.transcribe"
        : "audio.synthesize",
      "primary",
      "Audio intent"
    );
  }
  if (input.intent === "embedding") {
    add("embedding.generate", "primary", "Embedding intent");
  }

  if (caps.size === 0) {
    add("text.generate", "primary", "Default primary capability");
  }

  const list = [...caps.values()];
  if (!list.some((c) => c.role === "primary")) {
    list[0] = { ...list[0]!, role: "primary" };
  }
  // Collapse multiple primaries — prefer client capability, else first
  const primaries = list.filter((c) => c.role === "primary");
  if (primaries.length > 1) {
    const keep =
      (input.clientCapabilityId &&
        primaries.find((p) => p.capabilityId === input.clientCapabilityId)) ||
      primaries[0]!;
    return list.map((c) =>
      c.capabilityId === keep.capabilityId
        ? { ...c, role: "primary" as const }
        : { ...c, role: "supporting" as const }
    );
  }
  return list;
}

export function detectMissingInformation(input: {
  readonly prompt: string;
  readonly intent: BriefIntentKind;
  readonly deliverables: readonly BriefDeliverable[];
  readonly audience?: string;
  readonly availableContext?: BriefAvailableContext;
}): {
  readonly missing: BriefMissingInformation[];
  readonly assumptions: BriefAssumption[];
} {
  const missing: BriefMissingInformation[] = [];
  const assumptions: BriefAssumption[] = [];
  const prompt = input.prompt.trim();
  const isThin = prompt.split(/\s+/).length < 8;

  if (input.intent === "website" && isThin) {
    missing.push({
      key: "website_purpose",
      reason: "Required to produce useful website structure",
      severity: "required",
    });
    missing.push({
      key: "required_pages",
      reason: "Website scope (pages) not specified",
      severity: "required",
    });
    if (!input.audience) {
      missing.push({
        key: "target_audience",
        reason: "Required to produce targeted website messaging",
        severity: "required",
      });
    }
  }

  if (input.intent === "campaign" && isThin && !/\binstagram|landing|meta|ads?\b/i.test(prompt)) {
    missing.push({
      key: "campaign_channels",
      reason: "Campaign channels not specified",
      severity: "required",
    });
    if (!input.audience) {
      missing.push({
        key: "target_audience",
        reason: "Required to produce targeted campaign messaging",
        severity: "recommended",
      });
    }
  }

  if (input.intent === "landing_page" && isThin && !input.availableContext?.deliverableLabel) {
    missing.push({
      key: "landing_page_goal",
      reason: "Conversion goal / offer not specified",
      severity: "recommended",
    });
  }

  // Simple caption / short copy — do NOT over-block
  const isSimpleCaption =
    input.intent === "social_content" ||
    input.intent === "copy" ||
    input.deliverables.some((d) => d.type === "caption" || d.type === "copy");
  if (isSimpleCaption && prompt.split(/\s+/).length <= 40) {
    // strip required website/campaign missing that don't apply
  }

  if (/\binstagram\b/i.test(prompt) && !input.deliverables.some((d) => d.channel === "instagram")) {
    assumptions.push({
      statement: "Instagram is a primary content channel for this request.",
      source: "INFERENCE",
      confidence: 0.72,
    });
  }

  if (input.availableContext?.brandId) {
    assumptions.push({
      statement: `Brand context brandId=${input.availableContext.brandId} may enrich generation.`,
      source: "BRAND_CONTEXT",
      confidence: 0.8,
    });
  }

  return { missing, assumptions };
}

export { dim as extractDimensions };
