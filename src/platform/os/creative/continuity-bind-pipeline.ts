/**
 * Track A Phase A2 — Intent → Resolve → Bind pipeline for create prepass.
 * Flag-gated. Never rewrites the user brief.
 * Phase A5: optional cross-service carry + active campaign pack attach.
 */

import { detectIntentGateFromBrief, type IntentGateResult } from "./intent-gate";
import {
  attachShadowBrandContextPacket,
  bindBrandContextPacketToMetadata,
  buildBrandContextPacket,
} from "./context-binder";
import {
  defaultBrandKnowledgeResolver,
  type BrandKnowledgeResolver,
} from "./knowledge-resolver";
import {
  continuityLayerAffectsGeneration,
  getContinuityLayerFlag,
  type ContinuityLayerRollout,
} from "./continuity-layer-flags";
import { logOsExecutionEvent } from "../observability/execution-log";
import type { BrandContextPacket } from "./brand-context-packet";
import type { KnowledgeResolveResult } from "./knowledge-resolver";
import {
  mergeProfileFactsIntoResolve,
  resolveBrandProfileContext,
} from "./brand-profile-facts";
import { crossServiceOptionalSlots } from "./cross-service-reuse";
import {
  applyInlineBriefColorSatisfaction,
} from "../../../services/brand-inline-color-satisfaction";
import {
  applyProfileAndMetadataSlotSatisfaction,
} from "../../../services/brand-inline-asset-satisfaction";
import {
  applyVaultLogoSelection,
  resolveBrandVaultLogos,
  type VaultLogoCandidate,
} from "../../../services/brand-vault-logo-resolver";
import type { BrandMemorySlotKey } from "./brand-memory-slots";
import {
  defaultCampaignMemoryService,
  resolveCampaignMemoryRollout,
  type CampaignMemoryService,
} from "./campaign-memory-service";

const ROLLOUT_VALUES = new Set<ContinuityLayerRollout>([
  "off",
  "shadow",
  "canary",
  "on",
]);

/**
 * Resolve Context Binder / A2 create-path rollout.
 * Env `CONTINUITY_CONTEXT_BIND=off|shadow|canary|on` overrides the table default.
 */
export function resolveContextBindRollout(
  env: NodeJS.ProcessEnv = process.env
): ContinuityLayerRollout {
  const raw = env.CONTINUITY_CONTEXT_BIND?.trim().toLowerCase();
  if (raw && ROLLOUT_VALUES.has(raw as ContinuityLayerRollout)) {
    return raw as ContinuityLayerRollout;
  }
  return getContinuityLayerFlag("ContextBinder")?.rollout ?? "off";
}

export interface ContinuityBindPipelineInput {
  readonly brief: string;
  readonly brandId: string;
  readonly organizationId: string;
  readonly executionId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly rollout?: ContinuityLayerRollout;
  readonly resolver?: BrandKnowledgeResolver;
  readonly campaignMemory?: CampaignMemoryService;
}

export interface ContinuityBindPipelineResult {
  readonly rollout: ContinuityLayerRollout;
  readonly intent: IntentGateResult;
  readonly packet: BrandContextPacket;
  readonly metadata: Record<string, unknown>;
  readonly needsAsk: boolean;
  readonly briefUnchanged: true;
  readonly applied: boolean;
  readonly logoChoice?: {
    readonly candidates: readonly VaultLogoCandidate[];
  };
}

async function resolveLogoWithVault(input: {
  readonly resolve: KnowledgeResolveResult;
  readonly brandId: string;
  readonly organizationId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly profileLogoAssetId?: string;
}): Promise<{
  readonly resolve: KnowledgeResolveResult;
  readonly logoChoice?: { readonly candidates: readonly VaultLogoCandidate[] };
}> {
  if (!input.resolve.missingRequiredSlots.includes("logo")) {
    return { resolve: input.resolve };
  }

  const vault = await resolveBrandVaultLogos({
    organizationId: input.organizationId,
    brandId: input.brandId,
    metadata: input.metadata,
    profileLogoAssetId: input.profileLogoAssetId,
  });

  if (vault.selectedAssetId) {
    return {
      resolve: applyVaultLogoSelection({
        resolve: input.resolve,
        assetId: vault.selectedAssetId,
        provenance: "Brand vault logo",
      }),
    };
  }

  if (vault.needsChoice && vault.candidates.length > 1) {
    return {
      resolve: input.resolve,
      logoChoice: { candidates: vault.candidates },
    };
  }

  return { resolve: input.resolve };
}

export async function runContinuityBindPipeline(
  input: ContinuityBindPipelineInput
): Promise<ContinuityBindPipelineResult | null> {
  const rollout = input.rollout ?? resolveContextBindRollout();
  if (rollout === "off") {
    return null;
  }

  const brandId = input.brandId.trim();
  if (!brandId) {
    return null;
  }

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
  const campaignRollout = resolveCampaignMemoryRollout();
  const campaignSvc = input.campaignMemory ?? defaultCampaignMemoryService;

  const extraOptional: BrandMemorySlotKey[] = [];
  let campaignMeta: Record<string, unknown> = {};

  if (campaignRollout !== "off") {
    const service =
      typeof input.metadata?.service === "string"
        ? input.metadata.service
        : undefined;
    extraOptional.push(...crossServiceOptionalSlots(service));

    const campaignIdMeta =
      typeof input.metadata?.campaignId === "string"
        ? input.metadata.campaignId.trim()
        : undefined;
    try {
      const pack = await campaignSvc.resolveCampaignForBind({
        organizationId: input.organizationId,
        brandId,
        campaignId: campaignIdMeta,
      });
      if (pack && pack.status === "working") {
        campaignMeta = {
          campaignId: pack.campaignId,
          campaignPackId: pack.campaignId,
          campaignTitle: pack.title,
        };
        if (
          pack.slotPointers.some((p) => p.slotKey === "campaignLook") &&
          !intent.requiredSlots.includes("campaignLook") &&
          !extraOptional.includes("campaignLook")
        ) {
          extraOptional.push("campaignLook");
        }
      }
    } catch {
      // Campaign memory must never break bind.
    }
  }

  const resolver = input.resolver ?? defaultBrandKnowledgeResolver;
  const resolvedRaw = await resolver.resolve({
    brandId,
    organizationId: input.organizationId,
    intent,
    preferWorkingCampaignLook: intent.intentTags.includes("match_campaign"),
    extraOptionalSlots: extraOptional,
  });
  const profileContext = await resolveBrandProfileContext({
    brandId,
    organizationId: input.organizationId,
  });
  const profileFacts = profileContext.facts;
  const profileColorFact = profileFacts.find((f) => f.key === "colors");
  const storedProfileColors = profileColorFact?.value
    ? profileColorFact.value.split(/[,;|/]/).map((s) => s.trim()).filter(Boolean)
    : [];
  const resolvedWithInlineColors = applyInlineBriefColorSatisfaction({
    brief: input.brief,
    metadata: input.metadata,
    resolve: resolvedRaw,
    storedProfileColors,
  });
  const resolved = mergeProfileFactsIntoResolve(
    resolvedWithInlineColors,
    profileFacts
  );
  const resolvedWithProfileAssets = applyProfileAndMetadataSlotSatisfaction({
    resolve: resolved,
    metadata: input.metadata,
    profileLogoAssetId: profileContext.logoAssetId,
  });
  const logoResolution = await resolveLogoWithVault({
    resolve: resolvedWithProfileAssets,
    brandId,
    organizationId: input.organizationId,
    metadata: input.metadata,
    profileLogoAssetId: profileContext.logoAssetId,
  });
  const resolvedFinal = logoResolution.resolve;

  const packet = buildBrandContextPacket({ brandId, resolve: resolvedFinal });

  logOsExecutionEvent("continuity.bind", {
    requestId: input.executionId ?? "prepass",
    executionId: input.executionId ?? "prepass",
    organizationId: input.organizationId,
    status: rollout,
    capabilityId: intent.intentTags.join(",") || "unspecified",
  });

  if (rollout === "shadow") {
    return {
      rollout,
      intent,
      packet,
      metadata: {
        ...attachShadowBrandContextPacket(input.metadata, packet),
        ...(campaignRollout === "shadow" ? { campaignPackShadow: campaignMeta } : {}),
      },
      needsAsk:
        packet.missingRequiredSlots.length > 0 ||
        Boolean(logoResolution.logoChoice?.candidates.length),
      briefUnchanged: true,
      applied: false,
      ...(logoResolution.logoChoice ? { logoChoice: logoResolution.logoChoice } : {}),
    };
  }

  if (!continuityLayerAffectsGeneration(rollout)) {
    return null;
  }

  // new_mark / ignore_old_logo → do not force logo bind
  if (
    intent.intentTags.includes("new_mark") ||
    intent.intentTags.includes("ignore_old_logo")
  ) {
    return {
      rollout,
      intent,
      packet: { ...packet, missingRequiredSlots: [], assets: [] },
      metadata: {
        ...(input.metadata ?? {}),
        continuityIntentTags: [...intent.intentTags],
        continuitySkippedBind: "new_mark",
        ...campaignMeta,
      },
      needsAsk: false,
      briefUnchanged: true,
      applied: false,
    };
  }

  const hasSlots =
    intent.requiredSlots.length > 0 ||
    intent.optionalSlots.length > 0 ||
    extraOptional.length > 0;

  // unspecified with no slots → nothing to bind
  if (!hasSlots) {
    return {
      rollout,
      intent,
      packet,
      metadata: {
        ...(input.metadata ?? {}),
        continuityIntentTags: [...intent.intentTags],
        ...campaignMeta,
      },
      needsAsk: false,
      briefUnchanged: true,
      applied: false,
    };
  }

  const bound = bindBrandContextPacketToMetadata({
    brandId,
    resolve: resolvedFinal,
    metadata: {
      ...(input.metadata ?? {}),
      continuityIntentTags: [...intent.intentTags],
      ...campaignMeta,
    },
  });

  return {
    rollout,
    intent,
    packet: bound.packet,
    metadata: bound.metadata,
    needsAsk:
      bound.needsAsk || Boolean(logoResolution.logoChoice?.candidates.length),
    briefUnchanged: true,
    applied: true,
    ...(logoResolution.logoChoice ? { logoChoice: logoResolution.logoChoice } : {}),
  };
}
