/**
 * Retrieval scoring — selects Brand Brain sections/facts by query context.
 */

import type {
  BrandBrainDocument,
  BrandBrainRetrievalQuery,
  BrandBrainSection,
  EnrichmentRelevance,
} from "../contracts";

export interface ScoredCandidate {
  readonly section: BrandBrainSection;
  readonly key: string;
  readonly value: string | readonly string[] | Readonly<Record<string, unknown>>;
  readonly sourceRef: string;
  readonly relevance: EnrichmentRelevance;
  readonly confidence: number;
  readonly score: number;
  readonly whySelected: string;
}

export function retrieveCandidates(
  doc: BrandBrainDocument,
  query: BrandBrainRetrievalQuery
): ScoredCandidate[] {
  const out: ScoredCandidate[] = [];
  const prefer = new Set(query.preferSections ?? []);

  push(
    out,
    "organization_profile",
    "summary",
    doc.organization.summary,
    `org:${doc.organizationId}`,
    "high",
    0.95,
    "organization profile anchors every request",
    0.9,
    prefer
  );
  push(
    out,
    "brand_identity",
    "name",
    doc.identity.name,
    `brand:${doc.identity.brandId}`,
    "critical",
    0.98,
    "brand identity is always required for UNAGENCY proprietary enrichment",
    1,
    prefer
  );
  push(out, "mission", "mission", doc.identity.mission, `brand:${doc.identity.brandId}`, "high", 0.92, "mission steers messaging", 0.85, prefer);
  push(out, "vision", "vision", doc.identity.vision, `brand:${doc.identity.brandId}`, "medium", 0.88, "vision provides long-term context", 0.7, prefer);
  push(out, "values", "values", doc.identity.values, `brand:${doc.identity.brandId}`, "high", 0.9, "values constrain voice and claims", 0.82, prefer);
  push(out, "positioning", "positioning", doc.identity.positioning, `brand:${doc.identity.brandId}`, "high", 0.91, "positioning differentiates output", 0.86, prefer);
  push(out, "tone", "tone", doc.tone, `tone:${doc.organizationId}`, "critical", 0.94, "tone of voice is mandatory for enrichment", 0.95, prefer);
  push(out, "visual_guidelines", "visual", doc.visual, `visual:${doc.organizationId}`, "medium", 0.8, "visual guidelines for creatives", query.capabilityId?.includes("image") || query.capabilityId?.includes("design") ? 0.9 : 0.45, prefer);
  push(out, "content_preferences", "preferences", doc.contentPreferences, `prefs:${doc.organizationId}`, "high", 0.87, "content preferences shape formats and CTAs", 0.8, prefer);
  push(out, "style_guide", "notes", doc.styleGuideNotes, `style:${doc.organizationId}`, "medium", 0.84, "style guide notes refine language", 0.65, prefer);
  push(out, "market", "notes", doc.marketNotes, `market:${doc.organizationId}`, "medium", 0.8, "market notes situate the request", 0.55, prefer);

  for (const p of doc.products) {
    const match = !query.productId || query.productId === p.productId;
    push(
      out,
      "products",
      p.productId,
      p,
      `product:${p.productId}`,
      match ? "high" : "low",
      match ? 0.93 : 0.5,
      match ? "product matched request context" : "secondary product context",
      match ? 0.88 : 0.35,
      prefer
    );
  }
  for (const s of doc.services) {
    push(out, "services", s.serviceId, s, `service:${s.serviceId}`, "medium", 0.85, "service catalog enrichment", 0.6, prefer);
  }
  for (const a of doc.audiences) {
    const match = !query.audienceId || query.audienceId === a.audienceId;
    push(
      out,
      "audience",
      a.audienceId,
      a,
      `audience:${a.audienceId}`,
      match ? "critical" : "medium",
      match ? 0.95 : 0.7,
      match ? "target audience matched query" : "alternate audience context",
      match ? 0.92 : 0.5,
      prefer
    );
  }
  for (const persona of doc.personas) {
    push(out, "personas", persona.personaId, persona, `persona:${persona.personaId}`, "high", 0.88, "buyer persona for messaging", 0.7, prefer);
  }
  for (const c of doc.competitors) {
    push(out, "competitors", c.competitorId, c, `competitor:${c.competitorId}`, "medium", 0.82, "competitor context for differentiation", 0.62, prefer);
  }
  for (const pol of doc.policies) {
    push(
      out,
      pol.kind === "compliance" ? "compliance_rules" : pol.kind === "approval" ? "approval_preferences" : "marketing_policies",
      pol.policyId,
      pol,
      `policy:${pol.policyId}`,
      "critical",
      0.96,
      "policy constraints must be respected",
      0.9,
      prefer
    );
  }
  for (const loc of doc.localization) {
    const match = !query.region || query.region === loc.region || query.market === loc.region;
    push(
      out,
      "regional_preferences",
      loc.region,
      loc,
      `locale:${loc.region}`,
      match ? "high" : "low",
      match ? 0.9 : 0.55,
      match ? "localization matched region/market" : "other region reference",
      match ? 0.85 : 0.3,
      prefer
    );
  }
  for (const season of doc.seasonality) {
    push(out, "seasonality", season.seasonId, season, `season:${season.seasonId}`, "contextual", 0.75, "seasonal themes for timing", 0.5, prefer);
  }
  if (query.includeObjectives !== false) {
    for (const g of doc.goals) {
      const deptBoost = query.department && g.department === query.department ? 0.2 : 0;
      push(
        out,
        "business_goals",
        g.goalId,
        g,
        `goal:${g.goalId}`,
        g.priority === "p0" ? "critical" : "high",
        0.9,
        "organization objectives influence recommendations",
        0.7 + deptBoost,
        prefer
      );
    }
  }
  if (query.includeHistoricalPerformance !== false) {
    for (const ch of doc.campaignHistory) {
      const match = !query.campaignId || query.campaignId === ch.campaignId;
      push(
        out,
        "campaign_history",
        ch.campaignId,
        ch,
        `campaign:${ch.campaignId}`,
        match ? "high" : "contextual",
        match ? 0.9 : 0.7,
        match ? "campaign history matched query" : "prior campaign lesson",
        match ? 0.88 : 0.48,
        prefer
      );
    }
    for (const s of doc.successfulStrategies) {
      push(out, "successful_strategies", s.strategyId, s, `strategy_ok:${s.strategyId}`, "high", 0.86, "successful strategy memory", 0.72, prefer);
    }
    for (const s of doc.failedStrategies) {
      push(out, "failed_strategies", s.strategyId, s, `strategy_fail:${s.strategyId}`, "high", 0.86, "failed strategy guardrail", 0.74, prefer);
    }
  }

  return out
    .filter((c) => c.score >= 0.4)
    .sort((a, b) => b.score - a.score);
}

function push(
  out: ScoredCandidate[],
  section: BrandBrainSection,
  key: string,
  value: string | readonly string[] | Readonly<Record<string, unknown>>,
  sourceRef: string,
  relevance: EnrichmentRelevance,
  confidence: number,
  whySelected: string,
  baseScore: number,
  prefer: Set<BrandBrainSection>
): void {
  const boost = prefer.has(section) ? 0.1 : 0;
  out.push({
    section,
    key,
    value,
    sourceRef,
    relevance,
    confidence,
    whySelected,
    score: Math.min(1, baseScore + boost),
  });
}
