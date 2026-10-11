/**
 * Live bug: logo → logo-system rendered the brand's vault logo instead of the
 * approved logo-options X@V. A phase that depends on an upstream
 * logo-generating phase must not bind the vault/profile logo.
 */

import {
  metadataInheritsApprovedLogo,
  stripBrandLogoBinding,
} from "../../../src/platform/cdf/generation-context/inherited-logo";

describe("inherited approved logo supersedes vault logo", () => {
  it("logo-system inherits the approved logo-options mark", () => {
    expect(
      metadataInheritsApprovedLogo({ cdfServiceId: "logo", cdfPhaseId: "logo-system" }),
    ).toBe(true);
  });

  it("logo-options (depends on text territories) keeps the vault logo", () => {
    expect(
      metadataInheritsApprovedLogo({ cdfServiceId: "logo", cdfPhaseId: "logo-options" }),
    ).toBe(false);
  });

  it("non-CDF or unknown phases are unaffected", () => {
    expect(metadataInheritsApprovedLogo({ service: "branding" })).toBe(false);
    expect(metadataInheritsApprovedLogo(undefined)).toBe(false);
  });

  it("strips vault logo ids from bindings, assetIds and assets", () => {
    const out = stripBrandLogoBinding({
      vaultLogoChoice: "vault_1",
      brandLogoAssetId: "vault_1",
      logoAssetId: "vault_1",
      brandLogoProvenance: "Brand vault logo",
      assetIds: ["vault_1", "user_attachment"],
      assets: [
        { assetId: "vault_1", url: "data:image/png;base64,AAAA" },
        { assetId: "cdfart_x", relationshipLabel: "cdf_upstream_visual_artifact" },
      ],
      cdfPhaseId: "logo-system",
    });
    expect(out.vaultLogoChoice).toBeUndefined();
    expect(out.brandLogoAssetId).toBeUndefined();
    expect(out.logoAssetId).toBeUndefined();
    expect(out.brandLogoProvenance).toBeUndefined();
    expect(out.assetIds).toEqual(["user_attachment"]);
    expect(out.assets).toEqual([
      { assetId: "cdfart_x", relationshipLabel: "cdf_upstream_visual_artifact" },
    ]);
    expect(out.cdfPhaseId).toBe("logo-system");
  });
});
