/**
 * Track A Phase A6 — Product intelligence UX helpers.
 * Slot awareness, contradiction ASK, continuity summary for FE/Admin.
 * Never rewrites the brief; never invents brand truth.
 */

import type { BrandMemorySlotKey } from "./brand-memory-slots";
import {
  defaultBrandMemoryStore,
  type IBrandMemoryStore,
} from "./brand-memory-store";
import {
  getContinuityLayerFlag,
  parseContinuityRolloutEnv,
  continuityLayerAffectsGeneration,
  type ContinuityLayerRollout,
} from "./continuity-layer-flags";
import { detectIntentGateFromBrief } from "./intent-gate";
import { logoRoleFromMetadata } from "./creative-intent-classifier";
import { logOsExecutionEvent } from "../observability/execution-log";
import { extractBriefColors } from "../../../services/brand-color-extraction";

export type ContinuityUxChoice =
  | "reuse_existing"
  | "create_new"
  | "keep_brand_color"
  | "override_brief_color";

export type ContinuityUxPromptKind =
  | "slot_awareness"
  | "color_contradiction"
  | "slot_missing"
  | "brief_assist"
  | "suggest_refine";

export interface ContinuityUxPrompt {
  readonly kind: ContinuityUxPromptKind;
  readonly code: string;
  readonly message: string;
  readonly slotKey?: BrandMemorySlotKey;
  readonly choices?: readonly {
    readonly id: ContinuityUxChoice;
    readonly label: string;
  }[];
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ContinuityObservabilitySummary {
  readonly brandId?: string;
  readonly campaignId?: string;
  readonly provenanceLine?: string;
  /** Client-visible “what we understood” (Job Object sidecar). */
  readonly understoodBrief?: string;
  readonly boundAssetIds: readonly string[];
  readonly boundSlots: readonly string[];
  readonly intentTags: readonly string[];
  readonly forceStayInService: boolean;
  readonly postGuardHardMissCodes: readonly string[];
  readonly postGuardTasteCodes: readonly string[];
  readonly suggestRefine: boolean;
  readonly hardRetryCount?: number;
}

/** Env `CONTINUITY_PRODUCT_UX=off|shadow|canary|on` */
export function resolveProductUxRollout(
  env: NodeJS.ProcessEnv = process.env
): ContinuityLayerRollout {
  return (
    parseContinuityRolloutEnv(env.CONTINUITY_PRODUCT_UX) ??
    getContinuityLayerFlag("ProductIntelligenceUx")?.rollout ??
    "off"
  );
}

function extractColorWords(text: string): string[] {
  return extractBriefColors(text);
}

function clientSlotChoice(
  metadata: Readonly<Record<string, unknown>> | undefined
): ContinuityUxChoice | undefined {
  const raw =
    typeof metadata?.slotChoice === "string"
      ? metadata.slotChoice.trim()
      : typeof metadata?.continuitySlotChoice === "string"
        ? metadata.continuitySlotChoice.trim()
        : undefined;
  if (raw === "reuse" || raw === "reuse_existing") return "reuse_existing";
  if (raw === "new" || raw === "create_new" || raw === "new_mark") {
    return "create_new";
  }
  return undefined;
}

function clientContradictionChoice(
  metadata: Readonly<Record<string, unknown>> | undefined
): ContinuityUxChoice | undefined {
  const raw =
    typeof metadata?.contradictionChoice === "string"
      ? metadata.contradictionChoice.trim()
      : typeof metadata?.continuityContradictionChoice === "string"
        ? metadata.continuityContradictionChoice.trim()
        : undefined;
  if (raw === "keep_brand_color" || raw === "brand") return "keep_brand_color";
  if (raw === "override_brief_color" || raw === "brief") {
    return "override_brief_color";
  }
  if (metadata?.contradictionResolved === true) return "override_brief_color";
  return undefined;
}

function briefTouchesLogoFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): boolean {
  const role = logoRoleFromMetadata(metadata);
  return (
    role === "create_new" ||
    role === "reuse_canonical" ||
    role === "reuse_attached"
  );
}

/**
 * Slot awareness: approved logo exists and brief touches logo / new mark.
 * Logo touch comes from structured creative intent (LLM), not English word regex.
 */
export async function evaluateSlotAwareness(input: {
  readonly brief: string;
  readonly brandId: string;
  readonly organizationId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly store?: IBrandMemoryStore;
}): Promise<ContinuityUxPrompt | null> {
  const intent = detectIntentGateFromBrief(input.brief, {
    service:
      typeof input.metadata?.service === "string"
        ? input.metadata.service
        : undefined,
    subtype:
      typeof input.metadata?.subtype === "string"
        ? input.metadata.subtype
        : undefined,
    metadata: input.metadata,
  });
  const touchesLogo =
    intent.intentTags.includes("reuse_logo") ||
    intent.intentTags.includes("new_mark") ||
    intent.requiredSlots.includes("logo") ||
    briefTouchesLogoFromMetadata(input.metadata);

  if (!touchesLogo) return null;

  const choice = clientSlotChoice(input.metadata);
  if (choice === "reuse_existing" || choice === "create_new") return null;

  const store = input.store ?? defaultBrandMemoryStore;
  const canonical = await store.getCanonical(
    input.brandId,
    input.organizationId,
    "logo"
  );
  if (!canonical?.assetId) return null;

  // Explicit new_mark without choice still asks once when UX layer is on.
  return {
    kind: "slot_awareness",
    code: "CONTINUITY_SLOT_AWARENESS",
    message: `You already have an approved logo (${canonical.provenance}). Reuse it, or create a new version?`,
    slotKey: "logo",
    choices: [
      { id: "reuse_existing", label: "Reuse approved logo" },
      { id: "create_new", label: "Create a new logo" },
    ],
    details: {
      existingAssetId: canonical.assetId,
      existingVersion: canonical.version,
      provenance: canonical.provenance,
    },
  };
}

/**
 * Color contradiction: brief color word vs brand memory colors facts.
 */
export async function evaluateColorContradiction(input: {
  readonly brief: string;
  readonly brandId: string;
  readonly organizationId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly store?: IBrandMemoryStore;
}): Promise<ContinuityUxPrompt | null> {
  if (clientContradictionChoice(input.metadata)) return null;

  const briefColors = extractColorWords(input.brief);
  if (briefColors.length === 0) return null;

  const store = input.store ?? defaultBrandMemoryStore;
  const colorsEntry =
    (await store.getCanonical(
      input.brandId,
      input.organizationId,
      "colors"
    )) ??
    (await store.getWorking(input.brandId, input.organizationId, "colors"));
  if (!colorsEntry?.facts) return null;

  const memoryText = Object.values(colorsEntry.facts)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .join(" ")
    .toLowerCase();
  const memoryColors = extractColorWords(memoryText);
  if (memoryColors.length === 0) return null;

  const conflicting = briefColors.filter((c) => !memoryColors.includes(c));
  // Only flag when brief introduces a color that is not in memory AND memory has a different named color.
  if (conflicting.length === 0) return null;
  if (briefColors.every((c) => memoryColors.includes(c))) return null;

  const overlap = briefColors.filter((c) => memoryColors.includes(c));
  if (overlap.length > 0 && conflicting.length === 0) return null;

  // Classic case: memory has navy, brief says red.
  const novel = conflicting[0]!;
  const known = memoryColors[0]!;
  if (novel === known) return null;

  return {
    kind: "color_contradiction",
    code: "CONTINUITY_COLOR_CONTRADICTION",
    message: `Your brief mentions ${novel}, but brand colors are stored as ${memoryColors.join(", ")}. Which should we follow?`,
    slotKey: "colors",
    choices: [
      {
        id: "keep_brand_color",
        label: `Keep brand colors (${memoryColors.join(", ")})`,
      },
      {
        id: "override_brief_color",
        label: `Use brief color (${novel}) for this job`,
      },
    ],
    details: {
      briefColors,
      memoryColors,
      provenance: colorsEntry.provenance,
    },
  };
}

export async function runProductIntelligenceUx(input: {
  readonly brief: string;
  readonly brandId: string;
  readonly organizationId: string;
  readonly executionId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly store?: IBrandMemoryStore;
  readonly rollout?: ContinuityLayerRollout;
}): Promise<{
  readonly rollout: ContinuityLayerRollout;
  readonly prompts: readonly ContinuityUxPrompt[];
  readonly blockGenerate: boolean;
  readonly metadataExtras: Record<string, unknown>;
} | null> {
  const rollout = input.rollout ?? resolveProductUxRollout();
  if (rollout === "off") return null;
  if (!input.brandId.trim()) return null;

  const prompts: ContinuityUxPrompt[] = [];
  const slot = await evaluateSlotAwareness(input);
  if (slot) prompts.push(slot);
  const color = await evaluateColorContradiction(input);
  if (color) prompts.push(color);

  if (prompts.length === 0) {
    return {
      rollout,
      prompts: [],
      blockGenerate: false,
      metadataExtras: {},
    };
  }

  const blockGenerate = continuityLayerAffectsGeneration(rollout);

  logOsExecutionEvent("continuity.product_ux", {
    requestId: input.executionId ?? "prepass",
    executionId: input.executionId ?? "prepass",
    organizationId: input.organizationId,
    status: blockGenerate ? "ask" : "shadow",
    capabilityId: prompts.map((p) => p.code).join(","),
  });

  if (rollout === "shadow") {
    return {
      rollout,
      prompts,
      blockGenerate: false,
      metadataExtras: { continuityUxShadow: prompts },
    };
  }

  return {
    rollout,
    prompts,
    blockGenerate,
    metadataExtras: {
      continuityUx: {
        prompts,
        awaitingChoice: blockGenerate,
      },
    },
  };
}

/** Build observability summary from create extras + metadata (admin / diagnostics). */
export function buildContinuityObservabilitySummary(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly extras?: Readonly<Record<string, unknown>>;
}): ContinuityObservabilitySummary {
  const meta = input.metadata ?? {};
  const extras = input.extras ?? {};
  const snap =
    extras.continuitySnapshot && typeof extras.continuitySnapshot === "object"
      ? (extras.continuitySnapshot as Record<string, unknown>)
      : meta;
  const packet =
    (snap.brandContextPacket as Record<string, unknown> | undefined) ??
    (meta.brandContextPacket as Record<string, unknown> | undefined);
  const assets = Array.isArray(packet?.assets) ? packet!.assets : [];
  const boundSlots = assets
    .map((a) =>
      a && typeof a === "object" && typeof (a as { slot?: unknown }).slot === "string"
        ? String((a as { slot: string }).slot)
        : ""
    )
    .filter(Boolean);
  const assetIds = Array.isArray(snap.assetIds)
    ? (snap.assetIds as unknown[]).filter((x): x is string => typeof x === "string")
    : Array.isArray(meta.assetIds)
      ? (meta.assetIds as unknown[]).filter((x): x is string => typeof x === "string")
      : [];

  const guards =
    extras.continuityPostGuards &&
    typeof extras.continuityPostGuards === "object"
      ? (extras.continuityPostGuards as Record<string, unknown>)
      : undefined;

  const intentTags = Array.isArray(meta.continuityIntentTags)
    ? (meta.continuityIntentTags as unknown[]).map(String)
    : [];

  return {
    brandId:
      typeof snap.brandId === "string"
        ? snap.brandId
        : typeof meta.brandId === "string"
          ? meta.brandId
          : undefined,
    campaignId:
      typeof meta.campaignId === "string" ? meta.campaignId : undefined,
    provenanceLine:
      typeof snap.brandContextProvenance === "string"
        ? snap.brandContextProvenance
        : typeof meta.brandContextProvenance === "string"
          ? meta.brandContextProvenance
          : typeof packet?.provenanceLine === "string"
            ? packet.provenanceLine
            : undefined,
    understoodBrief:
      typeof meta.understoodBrief === "string"
        ? meta.understoodBrief.trim() || undefined
        : typeof (meta.jobObject as { understoodBrief?: unknown } | undefined)
              ?.understoodBrief === "string"
          ? String(
              (meta.jobObject as { understoodBrief: string }).understoodBrief
            ).trim() || undefined
          : undefined,
    boundAssetIds: assetIds,
    boundSlots,
    intentTags,
    forceStayInService: meta.forceStayInService === true,
    postGuardHardMissCodes: Array.isArray(guards?.hardMissCodes)
      ? (guards!.hardMissCodes as unknown[]).map(String)
      : [],
    postGuardTasteCodes: Array.isArray(guards?.tasteCodes)
      ? (guards!.tasteCodes as unknown[]).map(String)
      : [],
    suggestRefine: guards?.suggestRefine === true,
    hardRetryCount:
      typeof guards?.retryCount === "number" ? guards.retryCount : undefined,
  };
}
