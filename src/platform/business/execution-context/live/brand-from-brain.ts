/**
 * Maps Brand Brain documents (authoritative brand source) to BrandProfile.
 */

import type { BrandBrainDocument } from "../../brand-brain/contracts";
import type { BrandProfile } from "../../contracts/content";

export function brandProfileFromBrandBrainDocument(
  doc: BrandBrainDocument
): BrandProfile {
  const tone =
    doc.tone?.adjectives?.length
      ? doc.tone.adjectives.join(", ")
      : "professional";
  const rules = [
    ...(doc.tone?.doList ?? []),
    ...(doc.tone?.dontList?.map((d) => `don't: ${d}`) ?? []),
  ];

  return {
    brandId: doc.brandId ?? `brand_${doc.organizationId}`,
    organizationId: doc.organizationId,
    name: doc.identity?.name ?? doc.organization?.legalName ?? "Brand",
    toneOfVoice: tone,
    visualIdentity: doc.visual?.imageryNotes?.join("; ") ?? "clean",
    brandRules: rules.length > 0 ? rules : ["be clear"],
    colorPalette: doc.visual?.colorPalette ?? [],
    typography: doc.visual?.typography ?? [],
    logoAssetIds: [],
    brandAssetIds: [],
    brandMemoryRefs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
