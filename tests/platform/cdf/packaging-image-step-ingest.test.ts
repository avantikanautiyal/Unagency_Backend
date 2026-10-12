/**
 * Packaging image steps (Complete Pack, Views, SKU Adaptations) accept the
 * single image the provider returns.
 */

import { buildCanonicalImageIngestCandidate } from "../../../src/platform/cdf/generation-artifact/build-canonical-image-candidate";
import {
  normalizePackagingCompletePack,
  normalizePackagingViews,
  normalizePackagingSkuAdaptations,
} from "../../../src/platform/cdf/generation-artifact/adapters/packaging";
import {
  validatePackagingCompletePackData,
  validatePackagingViewsData,
  validatePackagingSkuAdaptationsData,
} from "../../../src/platform/cdf/artifacts/packaging/validate";
import { extractVaultAssetIdFromArtifactData } from "../../../src/platform/cdf/generation-context/canonical-visual-bytes";

const VAULT = "6accabdfa9b946b285aab64a";
const ref = (key: string) => ({ artifactId: `cdfart_x_1_${key}`, version: 1 });
const seed = (artifactKey: string) => {
  const built = buildCanonicalImageIngestCandidate({
    contract: { artifactKey } as never,
    vaultAssetId: VAULT,
  });
  if (!("rawOutput" in built)) throw new Error("seed failed");
  return built;
};

describe("packaging image steps accept a single image", () => {
  it("Complete Pack: one flat sheet covering all six surfaces", () => {
    const built = seed("packaging.complete-pack");
    const data = normalizePackagingCompletePack(built.rawOutput, {
      dielineRef: ref("dieline"),
      routesRef: ref("routes"),
      threeDDirectionRef: ref("3d"),
      frontPackRef: ref("front"),
    } as never);
    expect(validatePackagingCompletePackData(data as never)).toMatchObject({ ok: true });
    expect(data.surfaces.map((s) => s.role)).toEqual([
      "flat", "front", "back", "side", "side", "top", "bottom",
    ]);
    // The next step (Views) can find the sheet image.
    expect(extractVaultAssetIdFromArtifactData(data)).toBe(VAULT);
  });

  it("Views and SKU Adaptations: the image is kept and found downstream", () => {
    const views = normalizePackagingViews(seed("packaging.views").rawOutput, {
      completePackRef: ref("complete"),
      vaultAssetIds: [VAULT],
    } as never);
    expect(validatePackagingViewsData(views as never)).toMatchObject({ ok: true });
    expect(extractVaultAssetIdFromArtifactData(views)).toBe(VAULT);

    const skus = normalizePackagingSkuAdaptations(
      seed("packaging.sku-adaptations").rawOutput,
      { viewsRef: ref("views"), completePackRef: ref("complete") } as never,
    );
    expect(validatePackagingSkuAdaptationsData(skus as never)).toMatchObject({ ok: true });
    expect(extractVaultAssetIdFromArtifactData(skus)).toBe(VAULT);
  });
});
