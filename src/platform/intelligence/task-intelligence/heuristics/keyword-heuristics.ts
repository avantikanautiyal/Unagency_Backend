/**
 * Keyword heuristics for classification — no AI calls.
 */

const LAUNCH_KEYWORDS = ["launch", "release", "introduce", "debut", "rollout", "campaign"];
const PRODUCT_KEYWORDS = ["product", "collection", "sneaker", "shoe", "item", "sku"];
const MARKETING_KEYWORDS = ["marketing", "social", "instagram", "facebook", "ads", "carousel", "reel"];
const RESEARCH_KEYWORDS = ["research", "analysis", "competitor", "market", "audience"];
const CREATIVE_KEYWORDS = ["creative", "content", "copy", "design", "brand"];
const TECH_KEYWORDS = ["api", "code", "backend", "frontend", "prd", "sprint", "wireframe"];
const REAL_ESTATE_KEYWORDS = ["property", "listing", "brochure", "real estate", "whatsapp"];
const SOFTWARE_KEYWORDS = ["software", "app", "saas", "release notes", "documentation"];

export function containsAny(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

export function scoreKeywords(text: string, keywords: readonly string[]): number {
  const lower = text.toLowerCase();
  const hits = keywords.filter((k) => lower.includes(k)).length;
  return Math.min(1, hits / Math.max(1, keywords.length * 0.3));
}

export {
  LAUNCH_KEYWORDS,
  PRODUCT_KEYWORDS,
  MARKETING_KEYWORDS,
  RESEARCH_KEYWORDS,
  CREATIVE_KEYWORDS,
  TECH_KEYWORDS,
  REAL_ESTATE_KEYWORDS,
  SOFTWARE_KEYWORDS,
};
