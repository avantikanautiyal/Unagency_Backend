/**
 * Multilingual creative intent — closed schema via LLM.
 * Authority for create-vs-reuse logo and primary deliverable.
 * No brief regex. Fallback uses selected service + brand logo inventory only.
 */

import type { IDirectExecutionEngine } from "../../direct/contracts";
import {
  asOrganizationId,
  asWorkspaceId,
} from "../../core/identifiers";
import { normalizeSchemaForOpenAiStrict } from "../../providers/tools/structured/structured-output-execution";
import { applyDirectPassthroughMetadata } from "../../api/services/execution-thin-path";

export const CREATIVE_LOGO_ROLES = [
  "none",
  "reuse_canonical",
  "reuse_attached",
  "create_new",
] as const;

export type CreativeLogoRole = (typeof CREATIVE_LOGO_ROLES)[number];

export const CREATIVE_PRIMARY_DELIVERABLES = [
  "social_post",
  "ad",
  "logo_mark",
  "presentation",
  "website",
  "document",
  "email",
  "packaging",
  "print",
  "video",
  "other",
] as const;

export type CreativePrimaryDeliverable =
  (typeof CREATIVE_PRIMARY_DELIVERABLES)[number];

export type CreativeIntent = {
  readonly primaryDeliverable: CreativePrimaryDeliverable;
  readonly logoRole: CreativeLogoRole;
  readonly confidence: number;
  readonly briefNormalized: string;
  readonly source: "llm" | "service_prior";
};

const INTENT_SCHEMA = normalizeSchemaForOpenAiStrict({
  type: "object",
  properties: {
    primaryDeliverable: {
      type: "string",
      enum: [...CREATIVE_PRIMARY_DELIVERABLES],
    },
    logoRole: {
      type: "string",
      enum: [...CREATIVE_LOGO_ROLES],
    },
    confidence: { type: "number" },
    briefNormalized: { type: "string" },
  },
  required: [
    "primaryDeliverable",
    "logoRole",
    "confidence",
    "briefNormalized",
  ],
  additionalProperties: false,
});

const LLM_PROVIDERS = [
  { providerId: "provider.openai", modelId: "gpt-4o-mini" },
  { providerId: "provider.anthropic", modelId: "claude-haiku-4-5" },
  { providerId: "provider.gemini", modelId: "gemini-2.5-flash" },
] as const;

function isLogoDesignService(service?: string, subtype?: string): boolean {
  const svc = (service ?? "").trim().toLowerCase();
  const sub = (subtype ?? "").trim().toLowerCase();
  if (svc === "branding" && /logo/.test(sub)) return true;
  return /logo-design|logo_design/.test(sub);
}

function mapServiceToDeliverable(
  service?: string,
  subtype?: string
): CreativePrimaryDeliverable {
  if (isLogoDesignService(service, subtype)) return "logo_mark";
  const svc = (service ?? "").trim().toLowerCase();
  switch (svc) {
    case "social":
      return "social_post";
    case "ads":
      return "ad";
    case "presentations":
      return "presentation";
    case "website":
      return "website";
    case "print":
      return "print";
    case "packaging":
      return "packaging";
    case "video":
      return "video";
    case "email":
      return "email";
    default:
      return "other";
  }
}

/** Deterministic fallback — no brief string matching. */
export function resolveCreativeIntentFromServicePrior(input: {
  readonly service?: string;
  readonly subtype?: string;
  readonly hasCanonicalLogo?: boolean;
  readonly hasAttachedImage?: boolean;
}): CreativeIntent {
  const primaryDeliverable = mapServiceToDeliverable(
    input.service,
    input.subtype
  );
  if (primaryDeliverable === "logo_mark") {
    return {
      primaryDeliverable,
      logoRole: "create_new",
      confidence: 0.55,
      briefNormalized: "",
      source: "service_prior",
    };
  }
  if (input.hasAttachedImage) {
    return {
      primaryDeliverable,
      logoRole: "reuse_attached",
      confidence: 0.5,
      briefNormalized: "",
      source: "service_prior",
    };
  }
  if (input.hasCanonicalLogo) {
    return {
      primaryDeliverable,
      logoRole: "reuse_canonical",
      confidence: 0.5,
      briefNormalized: "",
      source: "service_prior",
    };
  }
  return {
    primaryDeliverable,
    logoRole: "none",
    confidence: 0.45,
    briefNormalized: "",
    source: "service_prior",
  };
}

function extractStructured(
  runtime:
    | import("../../providers/runtime/contracts/provider-execution-response").ProviderExecutionResult
    | undefined
): Record<string, unknown> | null {
  const output = runtime?.response?.output as Record<string, unknown> | undefined;
  if (!output) return null;
  if (output.structured && typeof output.structured === "object") {
    return output.structured as Record<string, unknown>;
  }
  const text =
    typeof output.content === "string"
      ? output.content
      : typeof output.text === "string"
        ? output.text
        : "";
  const match = text.trim().match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseLogoRole(value: unknown): CreativeLogoRole | null {
  const s = typeof value === "string" ? value.trim() : "";
  return (CREATIVE_LOGO_ROLES as readonly string[]).includes(s)
    ? (s as CreativeLogoRole)
    : null;
}

function parseDeliverable(value: unknown): CreativePrimaryDeliverable | null {
  const s = typeof value === "string" ? value.trim() : "";
  return (CREATIVE_PRIMARY_DELIVERABLES as readonly string[]).includes(s)
    ? (s as CreativePrimaryDeliverable)
    : null;
}

function mapLlmIntent(
  parsed: Record<string, unknown>,
  prior: CreativeIntent
): CreativeIntent | null {
  const logoRole = parseLogoRole(parsed.logoRole);
  const primaryDeliverable = parseDeliverable(parsed.primaryDeliverable);
  if (!logoRole || !primaryDeliverable) return null;

  // Hard prior: selected non-logo service stays; logo noun ≠ logo job.
  const onLogoDesign = prior.primaryDeliverable === "logo_mark";
  const lockedDeliverable = onLogoDesign
    ? primaryDeliverable === "other"
      ? "logo_mark"
      : primaryDeliverable
    : primaryDeliverable === "logo_mark"
      ? prior.primaryDeliverable
      : primaryDeliverable === "other"
        ? prior.primaryDeliverable
        : primaryDeliverable;

  let lockedLogoRole = logoRole;
  if (!onLogoDesign && logoRole === "create_new") {
    // Mentions of logo while on social/ads/etc. → reuse if brand has one, else none.
    lockedLogoRole =
      prior.logoRole === "reuse_attached"
        ? "reuse_attached"
        : prior.logoRole === "reuse_canonical"
          ? "reuse_canonical"
          : "none";
  }

  const confidenceRaw =
    typeof parsed.confidence === "number" ? parsed.confidence : 0.7;
  const confidence = Math.max(0, Math.min(1, confidenceRaw));
  const briefNormalized =
    typeof parsed.briefNormalized === "string"
      ? parsed.briefNormalized.trim().slice(0, 2000)
      : "";

  return {
    primaryDeliverable: lockedDeliverable,
    logoRole: lockedLogoRole,
    confidence,
    briefNormalized,
    source: "llm",
  };
}

/**
 * Classify creative intent. Brief may be any language / broken phrasing.
 * Service selection is a hard prior; logo create only when on logo-design
 * or the model is highly confident the user wants a new mark.
 */
export async function classifyCreativeIntent(input: {
  readonly integration?: IDirectExecutionEngine;
  readonly organizationId?: string;
  readonly brief: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly hasCanonicalLogo?: boolean;
  readonly hasAttachedImage?: boolean;
  readonly createId?: (prefix: string) => string;
}): Promise<CreativeIntent> {
  const prior = resolveCreativeIntentFromServicePrior({
    service: input.service,
    subtype: input.subtype,
    hasCanonicalLogo: input.hasCanonicalLogo,
    hasAttachedImage: input.hasAttachedImage,
  });

  const brief = input.brief.trim();
  if (
    !brief ||
    !input.integration ||
    !input.organizationId?.trim() ||
    brief.length < 4
  ) {
    return prior;
  }

  const id = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
  const llmPrompt = [
    "Classify the user's creative request.",
    "The brief may be in any language, mixed languages, or broken English.",
    "Return JSON only matching the schema.",
    "",
    "logoRole meanings:",
    '- "create_new": user wants a NEW logo/wordmark designed (primary job is making a mark).',
    '- "reuse_canonical": user wants to USE the brand\'s existing/approved logo inside another deliverable (post, ad, pack, etc.).',
    '- "reuse_attached": user wants to use an image they attached as the logo/reference.',
    '- "none": logo is not relevant.',
    "",
    "Rules:",
    "- Mentions of using/placing/including an approved/existing/brand logo on a post/ad/pack are reuse_canonical — NOT create_new.",
    `- Selected service is "${input.service ?? "unknown"}" subtype "${input.subtype ?? ""}". Prefer primaryDeliverable matching that selection unless the user clearly wants a different deliverable.`,
    "- If selected service is not logo-design, do NOT set logoRole=create_new just because the word logo appears.",
    `- Brand has canonical logo: ${input.hasCanonicalLogo ? "yes" : "no"}. User attached image: ${input.hasAttachedImage ? "yes" : "no"}.`,
    "- briefNormalized: short English paraphrase of what to make (1-2 sentences). Do not invent brand facts.",
    "",
    `Brief:\n${brief.slice(0, 4000)}`,
  ].join("\n");

  for (const provider of LLM_PROVIDERS) {
    const requestId = id("creative_intent");
    try {
      const result = await input.integration.run({
        requestId,
        rawPrompt: llmPrompt,
        organizationId: asOrganizationId(input.organizationId),
        workspaceId: asWorkspaceId("ws_default"),
        correlationId: requestId,
        mode: "direct_provider" as never,
        metadata: applyDirectPassthroughMetadata({
          skipOutputRequirements: true,
          productAction: "creative_intent_classify",
          preferredProviderId: provider.providerId,
          preferredModelId: provider.modelId,
          providerId: provider.providerId,
          modelId: provider.modelId,
          capabilityId: "text.generate",
          structuredOutput: {
            name: "creative_intent",
            schema: INTENT_SCHEMA,
            strict: true,
          },
        }),
      });

      if (!result.ok || result.value.success === false) continue;
      const parsed = extractStructured(result.value.artifacts.runtime);
      if (!parsed) continue;
      const mapped = mapLlmIntent(parsed, prior);
      if (mapped) return mapped;
    } catch {
      continue;
    }
  }

  return prior;
}

export function creativeIntentMetadataExtras(
  intent: CreativeIntent
): Record<string, unknown> {
  return {
    logoRole: intent.logoRole,
    creativeIntent: {
      primaryDeliverable: intent.primaryDeliverable,
      logoRole: intent.logoRole,
      confidence: intent.confidence,
      source: intent.source,
      ...(intent.briefNormalized
        ? { briefNormalized: intent.briefNormalized }
        : {}),
    },
  };
}

export function logoRoleFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): CreativeLogoRole | undefined {
  if (!metadata) return undefined;
  const direct = parseLogoRole(metadata.logoRole);
  if (direct) return direct;
  const nested = metadata.creativeIntent;
  if (nested && typeof nested === "object") {
    return (
      parseLogoRole((nested as Record<string, unknown>).logoRole) ?? undefined
    );
  }
  return undefined;
}
