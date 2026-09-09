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
};

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
  if (!brandId) {
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
  });

  const vaultCandidates: AuthoritativeLogoCandidate[] = vault.candidates.map(
    (candidate) =>
      Object.freeze({
        assetId: candidate.assetId,
        source: "VAULT" as const,
        name: candidate.name,
        folder: candidate.folder,
      }),
  );

  const result = Object.freeze({
    vaultCandidates: Object.freeze(vaultCandidates),
    attachmentLogoAssetIds: Object.freeze(attachmentLogoAssetIds),
    vaultLogoChoice:
      input.vaultLogoChoice?.trim() ||
      (vault.needsChoice ? undefined : vault.selectedAssetId) ||
      undefined,
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
