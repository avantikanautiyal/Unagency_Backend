/**
 * Attach resolved brand logo assetIds to execution metadata for visual jobs.
 * Route-visual prompts often omit "use our logo" — continuity intent gate alone
 * is not enough to bind the vault mark to image providers.
 *
 * Selection rules mirror CTI `resolveAuthoritativeLogo` (P4.9.7.1):
 * - explicit vaultLogoChoice → use it
 * - 1 vault/attachment candidate → bind
 * - 2+ candidates (vault and/or attachment) → logoChoiceRequired
 * - brandLogoAssetId alone does not skip multi-logo ask
 */

import {
  resolveBrandVaultLogos,
} from "./brand-vault-logo-resolver";
import { resolveBrandProfileContext } from "../platform/os/creative/brand-profile-facts";
import { detectIntentGateFromBrief } from "../platform/os/creative/intent-gate";
import { logoRoleFromMetadata } from "../platform/os/creative/creative-intent-classifier";
import { productActionFromMetadata } from "../platform/api/services/execution-thin-path";
import { optionalBrandContextObservability } from "../platform/execution/execution-input-policy";
import { resolveAuthoritativeLogo } from "../platform/collaboration/conversational-task-intelligence/authoritative-logo-resolver";
import type { AuthoritativeLogoCandidate } from "../platform/collaboration/conversational-task-intelligence/execution-specification";

const VISUAL_PRODUCT_ACTIONS = new Set([
  "route_visual",
  "route_visual_refine",
  "visual_direction",
  "direct_passthrough",
  "generate",
]);

const VISUAL_SERVICES = new Set([
  "merchandise",
  "branding",
  "print",
  "packaging",
  "pos",
  "social",
  "ads",
  "website",
]);

function metadataString(
  metadata: Readonly<Record<string, unknown>> | undefined,
  key: string
): string {
  const raw = metadata?.[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function metadataAssetIds(
  metadata: Readonly<Record<string, unknown>> | undefined
): string[] {
  const raw = metadata?.assetIds;
  if (Array.isArray(raw)) {
    return raw.map(String).map((s) => s.trim()).filter(Boolean);
  }
  const single = metadataString(metadata, "assetIds");
  return single ? [single] : [];
}

function attachmentLogoIdsFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): string[] {
  const raw = metadata?.attachmentLogoAssetIds;
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.map(String).map((s) => s.trim()).filter(Boolean)
    ),
  ];
}

function isImageCapability(capabilityId: string | undefined): boolean {
  const cap = (capabilityId ?? "").trim().toLowerCase();
  return cap === "image.generate" || cap === "image.edit";
}

function bindLogoToMetadata(input: {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly existingIds: readonly string[];
  readonly logoAssetId: string;
  readonly provenance: string;
  readonly brandId: string;
}): Record<string, unknown> {
  const { logoAssetId, provenance, brandId, existingIds } = input;
  if (existingIds.includes(logoAssetId)) {
    console.log(
      `[brand] logo attached | brandId=${brandId} | logoAssetId=${logoAssetId} | provenance=${provenance} | alreadyInAssetIds=true`
    );
    return {
      ...input.metadata,
      brandLogoAssetId: logoAssetId,
      logoAssetId,
      brandLogoProvenance: provenance,
      ...optionalBrandContextObservability({ logoAvailable: true }),
    };
  }
  console.log(
    `[brand] logo attached | brandId=${brandId} | logoAssetId=${logoAssetId} | provenance=${provenance}`
  );
  return {
    ...input.metadata,
    assetIds: [...new Set([...existingIds, logoAssetId])],
    brandLogoAssetId: logoAssetId,
    logoAssetId,
    brandLogoProvenance: provenance,
    ...optionalBrandContextObservability({ logoAvailable: true }),
  };
}

export function shouldProactivelyAttachBrandLogo(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly brief: string;
  readonly capabilityId?: string;
}): boolean {
  const metadata = input.metadata ?? {};
  const slotChoice =
    metadataString(metadata, "continuitySlotChoice") ||
    metadataString(metadata, "slotChoice");
  if (slotChoice === "create_new" || slotChoice === "new") return false;

  const logoRole = logoRoleFromMetadata(metadata);
  if (logoRole === "create_new") return false;

  const intent = detectIntentGateFromBrief(input.brief, {
    service:
      typeof metadata.service === "string" ? metadata.service : undefined,
    subtype:
      typeof metadata.subtype === "string" ? metadata.subtype : undefined,
    logoRole,
    metadata,
  });
  if (
    intent.intentTags.includes("new_mark") ||
    intent.intentTags.includes("ignore_old_logo")
  ) {
    return false;
  }

  const action = productActionFromMetadata(metadata)?.toLowerCase();
  if (action === "enhance_prompt" || action === "refine_question") {
    return false;
  }

  if (
    logoRole === "reuse_canonical" ||
    logoRole === "reuse_attached" ||
    intent.requiredSlots.includes("logo") ||
    intent.intentTags.includes("reuse_logo")
  ) {
    return true;
  }

  if (action && VISUAL_PRODUCT_ACTIONS.has(action)) return true;
  if (isImageCapability(input.capabilityId)) return true;

  const service = metadataString(metadata, "service").toLowerCase();
  if (service && VISUAL_SERVICES.has(service)) return true;

  if (
    metadataString(metadata, "brandLogoAssetId") ||
    metadataString(metadata, "logoAssetId")
  ) {
    return true;
  }

  return false;
}

export async function ensureBrandLogoInExecutionMetadata(input: {
  readonly organizationId: string;
  readonly brandId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly brief: string;
  readonly capabilityId?: string;
}): Promise<Record<string, unknown>> {
  if (!shouldProactivelyAttachBrandLogo(input)) {
    return { ...input.metadata };
  }

  const brandId = input.brandId.trim();
  if (!brandId) return { ...input.metadata };

  const existingIds = metadataAssetIds(input.metadata);
  const explicitChoice = metadataString(input.metadata, "vaultLogoChoice");
  const attachmentLogoIds = attachmentLogoIdsFromMetadata(input.metadata);

  // Explicit user selection always wins — no re-ask.
  if (explicitChoice) {
    const provenance =
      attachmentLogoIds.includes(explicitChoice)
        ? "Prompt attachment logo"
        : "Brand vault logo";
    return bindLogoToMetadata({
      metadata: input.metadata,
      existingIds,
      logoAssetId: explicitChoice,
      provenance,
      brandId,
    });
  }

  const profileContext = await resolveBrandProfileContext({
    brandId,
    organizationId: input.organizationId,
  });

  const vault = await resolveBrandVaultLogos({
    organizationId: input.organizationId,
    brandId,
    metadata: input.metadata,
    profileLogoAssetId: profileContext.logoAssetId,
  });

  const vaultCandidates: AuthoritativeLogoCandidate[] = vault.candidates.map(
    (candidate) =>
      Object.freeze({
        assetId: candidate.assetId,
        source: "VAULT" as const,
        name: candidate.name,
        folder: candidate.folder,
      })
  );

  const resolution = resolveAuthoritativeLogo({
    vaultCandidates,
    attachmentLogoAssetIds: attachmentLogoIds,
  });

  if (resolution.mode === "NEEDS_SELECTION" && resolution.candidates?.length) {
    console.log(
      `[brand] logo choice required | brandId=${brandId} | candidates=${resolution.candidates.length}`
    );
    return {
      ...input.metadata,
      logoChoiceRequired: true,
      logoChoiceCandidates: resolution.candidates.map((c) => ({
        assetId: c.assetId,
        name: c.name ?? (c.source === "ATTACHMENT" ? "Attached logo" : "Logo"),
        folder: c.folder,
        source: c.source,
        approvalStatus: "none",
      })),
      ...optionalBrandContextObservability({ logoAvailable: false }),
    };
  }

  if (resolution.mode === "USE_EXISTING" && resolution.assetId) {
    const provenance =
      resolution.source === "ATTACHMENT"
        ? "Prompt attachment logo"
        : "Brand vault logo";
    return bindLogoToMetadata({
      metadata: input.metadata,
      existingIds,
      logoAssetId: resolution.assetId,
      provenance,
      brandId,
    });
  }

  // No vault/attachment candidate — fall back to profile canonical logo.
  const profileLogo = profileContext.logoAssetId?.trim();
  if (profileLogo) {
    return bindLogoToMetadata({
      metadata: input.metadata,
      existingIds,
      logoAssetId: profileLogo,
      provenance: "Brand profile logo",
      brandId,
    });
  }

  // Prior metadata logo (e.g. carried from a previous turn) without vault hit.
  const metadataLogo =
    metadataString(input.metadata, "brandLogoAssetId") ||
    metadataString(input.metadata, "logoAssetId");
  if (metadataLogo) {
    return bindLogoToMetadata({
      metadata: input.metadata,
      existingIds,
      logoAssetId: metadataLogo,
      provenance: "Brand profile logo (metadata)",
      brandId,
    });
  }

  console.log(
    `[brand] logo missing | brandId=${brandId} | vaultCandidates=${vault.candidates.length} | profileLogo=none`
  );
  return {
    ...input.metadata,
    ...optionalBrandContextObservability({ logoAvailable: false }),
  };
}
