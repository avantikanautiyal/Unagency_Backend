/**
 * Service/subtype-specific contract extensions.
 * Adds requirements beyond kind templates without duplicating base contracts.
 */

import type { ContractRequirement, QualityDimension } from "./evaluation-methods";

export type ServiceContractExtension = {
  readonly hardRequirements?: readonly ContractRequirement[];
  readonly qualityDimensions?: readonly QualityDimension[];
  readonly structuredSchemaRef?: string;
  readonly mandatoryDoDExtras?: readonly string[];
};

function req(
  id: string,
  category: ContractRequirement["category"],
  description: string,
  method: ContractRequirement["evaluation"]["method"],
  expectedResult: string,
): ContractRequirement {
  return {
    id,
    class: "hard",
    category,
    description,
    evaluation: {
      method,
      expectedResult,
      severity: "high",
      blocksCompletion: true,
    },
  };
}

function quality(
  id: string,
  label: string,
  definition: string,
  threshold: number,
): QualityDimension {
  return {
    id,
    label,
    definition,
    scoringRange: { min: 0, max: 100 },
    evaluationMethod: "semantic_evaluator",
    threshold,
  };
}

/** Key: service/subtype from SERVICE_OUTPUT_MAP */
export const SERVICE_CONTRACT_EXTENSIONS: Readonly<
  Record<string, ServiceContractExtension>
> = Object.freeze({
  // —— Social ——
  "social/strategy": {
    hardRequirements: [
      req("svc.social.strategy.channels", "structure", "Channel recommendations and rationale", "semantic_evaluator", "channels identified"),
      req("svc.social.strategy.audience", "content", "Target audience definition", "semantic_evaluator", "audience defined"),
    ],
    qualityDimensions: [
      quality("svc.social.strategy.actionability", "Actionability", "Strategy is actionable with clear next steps", 75),
    ],
  },
  "social/content-design": {
    qualityDimensions: [
      quality("svc.social.content.engagement", "Engagement potential", "Creative designed for platform engagement", 70),
    ],
  },
  "social/copywriting": {
    hardRequirements: [
      req("svc.social.copy.cta", "content", "Call-to-action where appropriate", "semantic_evaluator", "CTA present"),
    ],
    qualityDimensions: [
      quality("svc.social.copy.hashtag_fit", "Hashtag/platform fit", "Copy fits platform conventions", 70),
    ],
  },

  // —— Website ——
  "website/corporate-website": {
    hardRequirements: [
      req("svc.website.corporate.pages", "structure", "Core corporate pages (home, about, contact minimum)", "artifact_inspection", "required pages exist"),
      req("svc.website.corporate.nav", "ux", "Site navigation functional", "runtime_validation", "navigation works"),
    ],
    qualityDimensions: [
      quality("svc.website.corporate.trust", "Trust & credibility", "Professional corporate presence", 75),
    ],
  },
  "website/ecom-website": {
    hardRequirements: [
      req("svc.website.ecom.catalog", "functionality", "Product catalog or listing pages", "artifact_inspection", "product pages exist"),
      req("svc.website.ecom.cart", "functionality", "Cart/checkout flow or equivalent", "runtime_validation", "purchase flow present"),
    ],
    qualityDimensions: [
      quality("svc.website.ecom.conversion", "Conversion UX", "E-commerce UX supports conversion", 75),
    ],
  },
  "website/landing-page": {
    hardRequirements: [
      req("svc.website.landing.hero", "structure", "Hero section with value proposition", "artifact_inspection", "hero section exists"),
      req("svc.website.landing.cta", "functionality", "Primary CTA functional", "runtime_validation", "CTA clickable"),
    ],
    qualityDimensions: [
      quality("svc.website.landing.conversion", "Conversion focus", "Single-purpose conversion design", 80),
    ],
  },
  "website/ui-design": {
    qualityDimensions: [
      quality("svc.website.ui.consistency", "Design system consistency", "Consistent UI components and patterns", 75),
    ],
  },
  "website/app-development": {
    hardRequirements: [
      req("svc.website.app.build", "technical", "Application builds and runs", "build_test_execution", "build succeeds"),
    ],
    qualityDimensions: [
      quality("svc.website.app.architecture", "Architecture", "Clean app structure", 70),
    ],
  },
  "website/ux-strategy": {
    hardRequirements: [
      req("svc.website.ux.research", "content", "User research or persona basis", "semantic_evaluator", "UX rationale documented"),
    ],
  },
  "website/design-systems": {
    hardRequirements: [
      req("svc.website.ds.tokens", "structure", "Design tokens or component specs documented", "artifact_inspection", "tokens/components defined"),
    ],
  },

  // —— Branding ——
  "branding/logo-design": {
    hardRequirements: [
      req("svc.branding.logo.primary", "deliverable", "Primary logo mark delivered", "artifact_inspection", "logo image present"),
      req("svc.branding.logo.scalable", "technical", "Logo works at multiple sizes", "visual_evaluator", "legible at small and large sizes"),
    ],
    qualityDimensions: [
      quality("svc.branding.logo.distinctiveness", "Distinctiveness", "Ownable, distinctive mark", 80),
    ],
  },
  "branding/visual-identity": {
    qualityDimensions: [
      quality("svc.branding.vi.cohesion", "System cohesion", "Cohesive visual identity system", 75),
    ],
  },
  "branding/brand-guidelines": {
    hardRequirements: [
      req("svc.branding.guidelines.usage", "content", "Logo/color/typography usage rules", "semantic_evaluator", "usage rules documented"),
    ],
  },
  "branding/brand-naming-taglines": {
    hardRequirements: [
      req("svc.branding.naming.options", "content", "Multiple naming or tagline options", "semantic_evaluator", "options provided"),
    ],
  },

  // —— Packaging ——
  "packaging/boxes": { qualityDimensions: [quality("svc.packaging.product_fit", "Product fit", "Packaging fits product context", 75)] },
  "packaging/pouches": { qualityDimensions: [quality("svc.packaging.product_fit", "Product fit", "Packaging fits product context", 75)] },
  "packaging/bottles": { qualityDimensions: [quality("svc.packaging.product_fit", "Product fit", "Packaging fits product context", 75)] },
  "packaging/labels": {
    hardRequirements: [req("svc.packaging.label.legibility", "visual", "Label text legible at print size", "visual_evaluator", "text legible")],
  },

  // —— Print ——
  "print/brochures": {
    hardRequirements: [req("svc.print.brochure.fold", "structure", "Brochure layout with fold consideration", "artifact_inspection", "fold layout present")],
  },
  "print/posters": {
    hardRequirements: [req("svc.print.poster.hierarchy", "visual", "Clear visual hierarchy at distance", "visual_evaluator", "hierarchy clear")],
  },
  "print/ooh-design": {
    qualityDimensions: [quality("svc.print.ooh.visibility", "OOH visibility", "Readable at outdoor viewing distance", 80)],
  },

  // —— Video ——
  "video/corporate-films": {
    qualityDimensions: [quality("svc.video.corporate.brand_story", "Brand storytelling", "Coherent brand narrative", 75)],
  },
  "video/explainer-videos": {
    hardRequirements: [req("svc.video.explainer.clarity", "content", "Concept explained clearly", "semantic_evaluator", "concept clear")],
  },
  "video/storyboards": {
    hardRequirements: [req("svc.video.storyboard.frames", "structure", "Storyboard frames with scene descriptions", "artifact_inspection", "frames present")],
    structuredSchemaRef: "DocumentPlan",
  },

  // —— Presentations ——
  "presentations/pitch-decks": {
    qualityDimensions: [quality("svc.presentation.pitch.investor_fit", "Investor readiness", "Pitch deck structure for investors", 80)],
  },
  "presentations/infographics": {
    qualityDimensions: [quality("svc.presentation.infographic.data_clarity", "Data clarity", "Data visualized clearly", 75)],
  },

  // —— Email ——
  "email/emailers": {
    hardRequirements: [req("svc.email.cta", "functionality", "Primary CTA in email", "artifact_inspection", "CTA link/button present")],
  },
  "email/newsletters": {
    hardRequirements: [req("svc.email.newsletter.sections", "structure", "Newsletter sections with scannable layout", "artifact_inspection", "sections present")],
  },

  // —— POS ——
  "pos/product-display-units": {
    qualityDimensions: [quality("svc.pos.retail_impact", "Retail impact", "Effective in-store presence", 75)],
  },

  // —— Merchandise ——
  "merchandise/t-shirts": {
    qualityDimensions: [quality("svc.merch.wearability", "Wearability design", "Design works on apparel", 70)],
  },

  // —— Photography ——
  "photography/product": {
    qualityDimensions: [quality("svc.photo.product.clarity", "Product clarity", "Product clearly shown", 80)],
  },
  "photography/retouching": {
    hardRequirements: [req("svc.photo.retouch.natural", "visual", "Retouching looks natural", "visual_evaluator", "natural appearance")],
  },

  // —— Strategy ——
  "strategy/*": {
    hardRequirements: [req("svc.strategy.framework", "structure", "Strategic framework with recommendations", "semantic_evaluator", "framework present")],
  },
  "strategy/brand-strategy": {
    qualityDimensions: [quality("svc.strategy.brand.positioning", "Positioning clarity", "Clear brand positioning", 80)],
  },

  // —— Ads ——
  "ads/performance-ads": {
    hardRequirements: [req("svc.ads.performance.hook", "content", "Attention hook in first 3 seconds/frame", "visual_evaluator", "hook present")],
    qualityDimensions: [quality("svc.ads.performance.conversion", "Conversion intent", "Designed for performance marketing", 75)],
  },

  // —— Event ——
  "event/event-concept": {
    hardRequirements: [req("svc.event.concept.theme", "content", "Event theme and concept defined", "semantic_evaluator", "theme defined")],
  },
  "event/event-identity": {
    qualityDimensions: [quality("svc.event.identity.cohesion", "Event identity cohesion", "Cohesive event visual identity", 75)],
  },
});

export function resolveServiceExtension(
  service: string,
  subtype: string,
): ServiceContractExtension | undefined {
  const exact = SERVICE_CONTRACT_EXTENSIONS[`${service}/${subtype}`];
  if (exact) return exact;
  return SERVICE_CONTRACT_EXTENSIONS[`${service}/*`];
}
