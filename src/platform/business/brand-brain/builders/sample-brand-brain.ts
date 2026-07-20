/**
 * Sample Brand Brain documents for tests and demos.
 */

import type { BrandBrainDocument } from "../contracts";

export function sampleBrandBrain(org: {
  organizationId: string;
  brandName: string;
  industry: string;
  tone: readonly string[];
  region: string;
  competitor: string;
}): BrandBrainDocument {
  const brandId = `brand_${org.organizationId}`;
  return {
    organizationId: org.organizationId,
    brandId,
    organization: {
      legalName: org.brandName,
      industry: org.industry,
      sizeBand: "growth",
      regions: [org.region],
      languages: ["en"],
      summary: `${org.brandName} is a ${org.industry} organization in ${org.region}.`,
    },
    identity: {
      brandId,
      name: org.brandName,
      mission: `Empower customers through ${org.industry} excellence.`,
      vision: `Lead ${org.industry} with trusted experiences.`,
      values: ["clarity", "integrity", "craft"],
      positioning: `${org.brandName} owns premium ${org.industry} outcomes.`,
      differentiators: ["proprietary brand brain", "evidence-led creative"],
    },
    products: [
      {
        productId: `prod_${org.organizationId}_1`,
        name: `${org.brandName} Core`,
        category: org.industry,
        benefits: ["speed", "quality"],
        proofPoints: ["case study A"],
      },
    ],
    services: [
      {
        serviceId: `svc_${org.organizationId}_1`,
        name: "Strategy Sprint",
        description: "2-week positioning sprint",
        outcomes: ["brief", "roadmap"],
      },
    ],
    audiences: [
      {
        audienceId: `aud_${org.organizationId}_1`,
        name: "Primary buyers",
        segments: ["enterprise", "mid-market"],
        pains: ["inconsistent brand voice"],
        desires: ["cohesive campaigns"],
        channels: ["linkedin", "email"],
      },
    ],
    personas: [
      {
        personaId: `per_${org.organizationId}_1`,
        name: "Maya the CMO",
        role: "CMO",
        goals: ["pipeline", "brand lift"],
        objections: ["generic AI output"],
      },
    ],
    competitors: [
      {
        competitorId: `comp_${org.organizationId}_1`,
        name: org.competitor,
        strengths: ["share of voice"],
        weaknesses: ["slow creative ops"],
        positioningNotes: `Differentiate from ${org.competitor} with evidence-driven brand fidelity.`,
      },
    ],
    tone: {
      adjectives: [...org.tone],
      doList: ["be specific", "sound human"],
      dontList: ["hype without proof"],
      samplePhrases: [`Only ${org.brandName} does it this way.`],
    },
    visual: {
      colorPalette: ["#111111", "#F5F5F5"],
      typography: ["Display", "Body"],
      imageryNotes: ["real product contexts"],
      logoUsage: ["clear space 1x"],
    },
    campaignHistory: [
      {
        campaignId: `camp_${org.organizationId}_1`,
        name: "Launch Pulse",
        objective: "awareness",
        outcome: "success",
        lessons: ["short hooks win"],
        channels: ["social"],
      },
    ],
    successfulStrategies: [
      {
        strategyId: `ok_${org.organizationId}_1`,
        title: "Proof-first narrative",
        summary: "Lead with outcomes, then features.",
        succeeded: true,
        tags: ["narrative"],
      },
    ],
    failedStrategies: [
      {
        strategyId: `fail_${org.organizationId}_1`,
        title: "Generic urgency",
        summary: "Discount-led CTAs underperformed.",
        succeeded: false,
        tags: ["cta"],
      },
    ],
    contentPreferences: {
      preferredFormats: ["short-form", "carousel"],
      prohibitedTopics: ["politics"],
      ctaStyles: ["soft invite"],
    },
    policies: [
      {
        policyId: `pol_${org.organizationId}_1`,
        kind: "compliance",
        title: "Claims policy",
        rules: ["no unverifiable superlatives"],
      },
      {
        policyId: `pol_${org.organizationId}_2`,
        kind: "approval",
        title: "Legal review",
        rules: ["brand claims need reviewer"],
      },
    ],
    localization: [
      {
        region: org.region,
        language: "en",
        culturalNotes: ["prefer local examples"],
        restrictedTopics: [],
      },
    ],
    seasonality: [
      {
        seasonId: `sea_${org.organizationId}_q4`,
        name: "Q4 Peak",
        months: [10, 11, 12],
        themes: ["year-end planning"],
        offers: ["annual plans"],
      },
    ],
    goals: [
      {
        goalId: `goal_${org.organizationId}_1`,
        title: "Increase qualified pipeline",
        kpi: "SQLs",
        priority: "p0",
        department: "marketing",
      },
    ],
    styleGuideNotes: ["prefer active voice"],
    marketNotes: [`${org.region} ${org.industry} demand rising`],
    assetRefs: [`asset_logo_${org.organizationId}`],
  };
}
