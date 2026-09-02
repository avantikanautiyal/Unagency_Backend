/**
 * Attach resolved brand logo assetIds to execution metadata for visual jobs.
 * Route-visual prompts often omit "use our logo" — continuity intent gate alone
 * is not enough to bind the vault mark to image providers.
 */

import {
  applyVaultLogoSelection,
  resolveBrandVaultLogos,
} from "./brand-vault-logo-resolver";
import { resolveBrandProfileContext } from "../platform/os/creative/brand-profile-facts";
import { detectIntentGateFromBrief } from "../platform/os/creative/intent-gate";
import { logoRoleFromMetadata } from "../platform/os/creative/creative-intent-classifier";
import { productActionFromMetadata } from "../platform/api/services/execution-thin-path";

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

function isImageCapability(capabilityId: string | undefined): boolean {
  const cap = (capabilityId ?? "").trim().toLowerCase();
  return cap === "image.generate" || cap === "image.edit";
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
  const metadataLogo =
    metadataString(input.metadata, "brandLogoAssetId") ||
    metadataString(input.metadata, "logoAssetId");

  if (metadataLogo) {
    const provenance = "Brand profile logo (metadata)";
    if (existingIds.includes(metadataLogo)) {
      console.log(
        `[brand] logo attached | brandId=${brandId} | logoAssetId=${metadataLogo} | provenance=${provenance} | alreadyInAssetIds=true`
      );
      return {
        ...input.metadata,
        brandLogoAssetId: metadataLogo,
        logoAssetId: metadataLogo,
      };
    }
    console.log(
      `[brand] logo attached | brandId=${brandId} | logoAssetId=${metadataLogo} | provenance=${provenance}`
    );
    return {
      ...input.metadata,
      assetIds: [...new Set([...existingIds, metadataLogo])],
      brandLogoAssetId: metadataLogo,
      logoAssetId: metadataLogo,
      brandLogoProvenance: "Brand profile logo",
    };
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

  const logoAssetId =
    vault.selectedAssetId ||
    profileContext.logoAssetId?.trim();

  if (!logoAssetId) {
    console.log(
      `[brand] logo missing | brandId=${brandId} | vaultCandidates=${vault.candidates.length} | profileLogo=${profileContext.logoAssetId ?? "none"}`
    );
    return { ...input.metadata };
  }

  const provenance = vault.selectedAssetId
    ? "Brand vault logo"
    : "Brand profile logo";

  if (existingIds.includes(logoAssetId)) {
    console.log(
      `[brand] logo attached | brandId=${brandId} | logoAssetId=${logoAssetId} | provenance=${provenance} | alreadyInAssetIds=true`
    );
    return {
      ...input.metadata,
      brandLogoAssetId: logoAssetId,
      logoAssetId,
    };
  }

  const mergedIds = [...new Set([...existingIds, logoAssetId])];
  console.log(
    `[brand] logo attached | brandId=${brandId} | logoAssetId=${logoAssetId} | provenance=${provenance}`
  );
  return {
    ...input.metadata,
    assetIds: mergedIds,
    brandLogoAssetId: logoAssetId,
    logoAssetId,
    brandLogoProvenance: provenance,
  };
}

export async function resolveBrandLogoAssetIdForBind(input: {
  readonly organizationId: string;
  readonly brandId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): Promise<string | undefined> {
  const profileContext = await resolveBrandProfileContext({
    brandId: input.brandId,
    organizationId: input.organizationId,
  });
  const vault = await resolveBrandVaultLogos({
    organizationId: input.organizationId,
    brandId: input.brandId,
    metadata: input.metadata,
    profileLogoAssetId: profileContext.logoAssetId,
  });
  return (
    vault.selectedAssetId ||
    profileContext.logoAssetId?.trim() ||
    metadataString(input.metadata, "brandLogoAssetId") ||
    metadataString(input.metadata, "logoAssetId") ||
    undefined
  );
}

export function applyResolvedLogoToKnowledgeResolve(
  resolve: Parameters<typeof applyVaultLogoSelection>[0]["resolve"],
  assetId: string | undefined
) {
  if (!assetId?.trim()) return resolve;
  return applyVaultLogoSelection({
    resolve,
    assetId,
    provenance: "Brand vault logo",
  });
}
