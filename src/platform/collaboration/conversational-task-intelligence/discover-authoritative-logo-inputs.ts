/**
 * P4.9.7.1 — Discover authoritative logo candidates from vault + attachments.
 */

import { resolveBrandVaultLogos } from "../../../services/brand-vault-logo-resolver";
import { resolveBrandProfileContext } from "../../os/creative/brand-profile-facts";
import type { AuthoritativeLogoCandidate } from "./execution-specification";

export type AuthoritativeLogoDiscoveryInput = {
  readonly organizationId: string;
  readonly brandId?: string;
  readonly vaultLogoChoice?: string;
  readonly attachmentLogoAssetIds?: readonly string[];
  readonly brief?: string;
  readonly service?: string;
  readonly subtype?: string;
};

/** Jobs that design a new mark never reuse (or ask about) existing logos. */
export function jobCreatesNewLogo(input: {
  readonly brief?: string;
  readonly service?: string;
  readonly subtype?: string;
}): boolean {
  const service = (input.service ?? "").trim().toLowerCase();
  const subtype = (input.subtype ?? "").trim().toLowerCase();
  if (service === "branding" && /logo/.test(subtype)) return true;
  return /\b(?:create|design|generate|make|build)\s+(?:me\s+|us\s+)?(?:a|an)\s+(?:new\s+)?(?:logo|wordmark)\b|\bnew\s+(?:logo|wordmark)\b|\bredesign\s+(?:the\s+|our\s+)?logo\b/i.test(
    input.brief ?? "",
  );
}

export type AuthoritativeLogoDiscoveryResult = {
  readonly vaultCandidates: readonly AuthoritativeLogoCandidate[];
  readonly attachmentLogoAssetIds: readonly string[];
  readonly vaultLogoChoice?: string;
};

export async function discoverAuthoritativeLogoInputs(
  input: AuthoritativeLogoDiscoveryInput,
): Promise<AuthoritativeLogoDiscoveryResult> {
  const attachmentLogoAssetIds = (input.attachmentLogoAssetIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean);

  const brandId = input.brandId?.trim();
  if (!brandId || jobCreatesNewLogo(input)) {
    return Object.freeze({
      vaultCandidates: Object.freeze([]),
      attachmentLogoAssetIds: Object.freeze(attachmentLogoAssetIds),
      vaultLogoChoice: input.vaultLogoChoice?.trim() || undefined,
    });
  }

  const profileContext = await resolveBrandProfileContext({
    brandId,
    organizationId: input.organizationId,
  });

  const vault = await resolveBrandVaultLogos({
    organizationId: input.organizationId,
    brandId,
    metadata: input.vaultLogoChoice
      ? { vaultLogoChoice: input.vaultLogoChoice.trim() }
      : undefined,
    profileLogoAssetId: profileContext.logoAssetId,
    brief: input.brief,
  });
  // 2+ vault logos never resolve silently — the official one is only listed first.
  const vaultDefault =
    vault.needsChoice || attachmentLogoAssetIds.length > 0
      ? undefined
      : vault.selectedAssetId;

  const vaultCandidates: AuthoritativeLogoCandidate[] = vault.candidates.map(
    (candidate) =>
      Object.freeze({
        assetId: candidate.assetId,
        source: "VAULT" as const,
        name: candidate.name,
        folder: candidate.folder,
        ...(candidate.official ? { official: true } : {}),
      }),
  );

  const result = Object.freeze({
    vaultCandidates: Object.freeze(vaultCandidates),
    attachmentLogoAssetIds: Object.freeze(attachmentLogoAssetIds),
    vaultLogoChoice: input.vaultLogoChoice?.trim() || vaultDefault || undefined,
  });
  if (vaultCandidates.length > 1 || attachmentLogoAssetIds.length > 0) {
    console.log(
      `[UNAGENCY-LOGO-DISCOVERY] ${JSON.stringify({
        brandId,
        vaultCount: vaultCandidates.length,
        attachmentCount: attachmentLogoAssetIds.length,
        needsChoice: vault.needsChoice,
      })}`,
    );
  }
  return result;
}
