/**
 * Canonical capability catalog — extensible mapping.
 */

export const CANONICAL_CAPABILITIES = [
  "marketing.social.carousel",
  "marketing.social.reel",
  "marketing.social.story",
  "marketing.social.ad_copy",
  "marketing.email.campaign",
  "marketing.seo.blog",
  "marketing.ads.facebook",
  "marketing.ads.google",
  "marketing.landing.copy",
  "marketing.kpi.plan",
  "branding.strategy",
  "branding.guidelines",
  "branding.review",
  "research.market.analysis",
  "research.competitor.analysis",
  "research.audience.analysis",
  "content.calendar",
  "campaign.strategy",
  "coding.backend.node",
  "coding.frontend.react",
  "coding.mobile.react-native",
  "coding.ai.integration",
  "design.logo",
  "design.banner",
  "design.ui",
  "video.script",
  "video.storyboard",
  "video.editing",
  "customer.support.reply",
  "finance.invoice.analysis",
  "legal.contract.review",
  "seo.metadata",
] as const;

export type CanonicalCapabilityId = (typeof CANONICAL_CAPABILITIES)[number];
