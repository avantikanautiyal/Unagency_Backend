/**
 * Deterministic Production Scenario Library.
 */

import type { ProductionScenario, ScenarioExpectations } from "../contracts/scenario";
import type { ScenarioDomain } from "../contracts/enums";

function exp(
  partial: ScenarioExpectations
): ScenarioExpectations {
  return partial;
}

function scenario(
  domain: ScenarioDomain,
  name: string,
  prompt: string,
  expectations: ScenarioExpectations,
  tags: readonly string[] = []
): ProductionScenario {
  return {
    scenarioId: `scn_${domain}`,
    domain,
    name,
    businessPrompt: prompt,
    expectations,
    tags: [domain, ...tags],
  };
}

export const PRODUCTION_SCENARIO_LIBRARY: readonly ProductionScenario[] = [
  scenario(
    "marketing",
    "Campaign Launch",
    "Launch a sneaker marketing campaign with social carousel copy and brand messaging",
    exp({
      expectedCapabilities: ["marketing.copywriting", "marketing.social.carousel"],
      expectedWorkflowHint: "campaign",
      expectedAgentPlanHint: "marketing",
      expectedModelCategory: "llm",
      expectedQualityThreshold: 0.5,
      expectedLatencyMsMax: 120_000,
      expectedCostMin: 0,
      expectedCostMax: 50,
    }),
    ["campaigns"]
  ),
  scenario(
    "software_development",
    "Feature Implementation Plan",
    "Generate an implementation plan and code scaffolding for a user authentication API",
    exp({
      expectedCapabilities: ["software.code_generation"],
      expectedWorkflowHint: "software",
      expectedAgentPlanHint: "engineering",
      expectedModelCategory: "llm",
      expectedQualityThreshold: 0.5,
      expectedLatencyMsMax: 120_000,
      expectedCostMin: 0,
      expectedCostMax: 50,
    })
  ),
  scenario(
    "research",
    "Market Analysis",
    "Research the competitive landscape for AI marketing platforms and summarize key trends",
    exp({
      expectedCapabilities: ["research.market_analysis"],
      expectedWorkflowHint: "research",
      expectedAgentPlanHint: "research",
      expectedModelCategory: "llm",
      expectedQualityThreshold: 0.5,
      expectedLatencyMsMax: 120_000,
      expectedCostMin: 0,
      expectedCostMax: 50,
    })
  ),
  scenario(
    "image_generation",
    "Brand Imagery Brief",
    "Create a brief and capability plan for generating brand imagery for a summer retail collection",
    exp({
      expectedCapabilities: ["design.image_generation"],
      expectedWorkflowHint: "design",
      expectedAgentPlanHint: "creative",
      expectedModelCategory: "image",
      expectedQualityThreshold: 0.4,
      expectedLatencyMsMax: 180_000,
      expectedCostMin: 0,
      expectedCostMax: 100,
    })
  ),
  scenario(
    "video_generation",
    "Short-Form Video Plan",
    "Plan a short-form product video campaign for social reels including shot list outline",
    exp({
      expectedCapabilities: ["video.short_form_generation"],
      expectedWorkflowHint: "video",
      expectedAgentPlanHint: "video",
      expectedModelCategory: "video",
      expectedQualityThreshold: 0.4,
      expectedLatencyMsMax: 180_000,
      expectedCostMin: 0,
      expectedCostMax: 150,
    })
  ),
  scenario(
    "audio_generation",
    "Voiceover Brief",
    "Plan voiceover and soundtrack requirements for a product launch spot",
    exp({
      expectedCapabilities: ["marketing.copywriting"],
      expectedWorkflowHint: "audio",
      expectedAgentPlanHint: "creative",
      expectedModelCategory: "audio",
      expectedQualityThreshold: 0.4,
      expectedLatencyMsMax: 120_000,
      expectedCostMin: 0,
      expectedCostMax: 50,
    })
  ),
  scenario(
    "translation",
    "Multilingual Campaign",
    "Translate and localize a product landing page campaign brief into Spanish and French",
    exp({
      expectedCapabilities: ["marketing.copywriting"],
      expectedWorkflowHint: "localization",
      expectedAgentPlanHint: "content",
      expectedModelCategory: "llm",
      expectedQualityThreshold: 0.5,
      expectedLatencyMsMax: 120_000,
      expectedCostMin: 0,
      expectedCostMax: 40,
    })
  ),
  scenario(
    "customer_support",
    "Support Reply Draft",
    "Draft a customer support response for a delayed shipment complaint with empathy and next steps",
    exp({
      expectedCapabilities: ["marketing.copywriting"],
      expectedWorkflowHint: "support",
      expectedAgentPlanHint: "support",
      expectedModelCategory: "llm",
      expectedQualityThreshold: 0.5,
      expectedLatencyMsMax: 90_000,
      expectedCostMin: 0,
      expectedCostMax: 30,
    })
  ),
  scenario(
    "sales",
    "Sales Outreach",
    "Create a B2B sales outreach sequence for an enterprise AI platform prospect",
    exp({
      expectedCapabilities: ["marketing.copywriting", "business.strategy"],
      expectedWorkflowHint: "sales",
      expectedAgentPlanHint: "sales",
      expectedModelCategory: "llm",
      expectedQualityThreshold: 0.5,
      expectedLatencyMsMax: 120_000,
      expectedCostMin: 0,
      expectedCostMax: 40,
    })
  ),
  scenario(
    "legal",
    "Contract Review Brief",
    "Summarize risk areas for reviewing a SaaS vendor contract focused on data processing terms",
    exp({
      expectedCapabilities: ["legal.contract_review"],
      expectedWorkflowHint: "legal",
      expectedAgentPlanHint: "legal",
      expectedModelCategory: "llm",
      expectedQualityThreshold: 0.6,
      expectedLatencyMsMax: 120_000,
      expectedCostMin: 0,
      expectedCostMax: 60,
    })
  ),
  scenario(
    "healthcare",
    "Patient Education Content",
    "Draft patient-friendly education content explaining a routine wellness screening process",
    exp({
      expectedCapabilities: ["marketing.copywriting"],
      expectedWorkflowHint: "healthcare",
      expectedAgentPlanHint: "content",
      expectedModelCategory: "llm",
      expectedQualityThreshold: 0.55,
      expectedLatencyMsMax: 120_000,
      expectedCostMin: 0,
      expectedCostMax: 40,
    }),
    ["regulated"]
  ),
  scenario(
    "education",
    "Lesson Outline",
    "Create a lesson outline for teaching high-school students about AI literacy and safety",
    exp({
      expectedCapabilities: ["marketing.copywriting"],
      expectedWorkflowHint: "education",
      expectedAgentPlanHint: "education",
      expectedModelCategory: "llm",
      expectedQualityThreshold: 0.5,
      expectedLatencyMsMax: 120_000,
      expectedCostMin: 0,
      expectedCostMax: 40,
    })
  ),
  scenario(
    "retail",
    "Seasonal Collection Launch",
    "Launch a new sneaker collection with marketing carousel and landing page copy",
    exp({
      expectedCapabilities: ["marketing.copywriting", "marketing.social.carousel"],
      expectedWorkflowHint: "retail",
      expectedAgentPlanHint: "retail",
      expectedModelCategory: "llm",
      expectedQualityThreshold: 0.5,
      expectedLatencyMsMax: 120_000,
      expectedCostMin: 0,
      expectedCostMax: 50,
    }),
    ["campaigns"]
  ),
  scenario(
    "hospitality",
    "Hotel Promo Package",
    "Create a weekend getaway promotional package description for a boutique hotel",
    exp({
      expectedCapabilities: ["marketing.copywriting"],
      expectedWorkflowHint: "hospitality",
      expectedAgentPlanHint: "marketing",
      expectedModelCategory: "llm",
      expectedQualityThreshold: 0.5,
      expectedLatencyMsMax: 120_000,
      expectedCostMin: 0,
      expectedCostMax: 40,
    })
  ),
  scenario(
    "manufacturing",
    "Operations Brief",
    "Produce an operations improvement brief to reduce assembly line downtime",
    exp({
      expectedCapabilities: ["business.strategy"],
      expectedWorkflowHint: "manufacturing",
      expectedAgentPlanHint: "operations",
      expectedModelCategory: "llm",
      expectedQualityThreshold: 0.5,
      expectedLatencyMsMax: 120_000,
      expectedCostMin: 0,
      expectedCostMax: 50,
    })
  ),
  scenario(
    "finance",
    "Forecast Narrative",
    "Generate a financial forecasting narrative for Q3 revenue scenarios for a SaaS business",
    exp({
      expectedCapabilities: ["finance.forecasting"],
      expectedWorkflowHint: "finance",
      expectedAgentPlanHint: "finance",
      expectedModelCategory: "llm",
      expectedQualityThreshold: 0.55,
      expectedLatencyMsMax: 120_000,
      expectedCostMin: 0,
      expectedCostMax: 50,
    })
  ),
  scenario(
    "hr",
    "Job Description Draft",
    "Draft a job description for a senior platform engineer role focused on AI systems",
    exp({
      expectedCapabilities: ["marketing.copywriting"],
      expectedWorkflowHint: "hr",
      expectedAgentPlanHint: "hr",
      expectedModelCategory: "llm",
      expectedQualityThreshold: 0.5,
      expectedLatencyMsMax: 90_000,
      expectedCostMin: 0,
      expectedCostMax: 30,
    })
  ),
];

export function listScenarioIds(): readonly string[] {
  return PRODUCTION_SCENARIO_LIBRARY.map((s) => s.scenarioId);
}

export function getScenario(scenarioId: string): ProductionScenario | undefined {
  return PRODUCTION_SCENARIO_LIBRARY.find((s) => s.scenarioId === scenarioId);
}

export function getScenarioByDomain(domain: ScenarioDomain): ProductionScenario | undefined {
  return PRODUCTION_SCENARIO_LIBRARY.find((s) => s.domain === domain);
}
