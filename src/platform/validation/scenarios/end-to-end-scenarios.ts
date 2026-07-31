/**
 * End-to-end validation scenario definitions — stage graphs only.
 */

import type { ValidationScenarioDefinition } from "../contracts";

export const E2E_VALIDATION_SCENARIOS: readonly ValidationScenarioDefinition[] = [
  {
    scenarioId: "campaign_generation",
    name: "Campaign Generation",
    description:
      "Organization → Workspace → Brand → Campaign → Task/Capability → Brand Brain → Knowledge → Planning → Model/Provider → Generation → Evaluation → Storage → Gateway",
    stages: [
      "organization",
      "workspace",
      "brand",
      "campaign_request",
      "task_intelligence",
      "capability_intelligence",
      "brand_brain",
      "knowledge_intelligence",
      "planning",
      "model_selection",
      "provider_selection",
      "generation",
      "evaluation",
      "storage",
      "gateway_response",
    ],
    tags: ["marketing", "e2e", "brand-brain", "knowledge"],
  },
  {
    scenarioId: "website_generation",
    name: "Website Generation",
    description: "Page generation, SEO, brand adaptation, execution intelligence, audit, storage",
    stages: [
      "organization",
      "workspace",
      "brand_brain",
      "page_generation",
      "seo",
      "brand_adaptation",
      "generation",
      "execution_intelligence",
      "audit_trail",
      "storage",
      "gateway_response",
    ],
    tags: ["website", "seo"],
  },
  {
    scenarioId: "landing_page",
    name: "Landing Page",
    description: "Brand/knowledge retrieval, AI execution, explainability, quality evaluation",
    stages: [
      "brand_retrieval",
      "knowledge_retrieval",
      "ai_execution",
      "explainability",
      "quality_evaluation",
      "audit_trail",
      "gateway_response",
    ],
    tags: ["landing", "explainability"],
  },
  {
    scenarioId: "logo_generation",
    name: "Logo Generation",
    description: "Image provider routing, evaluation, storage, metadata, cost tracking",
    stages: [
      "image_routing",
      "provider_selection",
      "generation",
      "evaluation",
      "metadata",
      "cost_tracking",
      "storage",
      "gateway_response",
    ],
    tags: ["image", "logo"],
  },
  {
    scenarioId: "research_merge",
    name: "Research Provider Merge",
    description: "Validate Perplexity, Exa, Tavily merge paths",
    stages: [
      "research_providers",
      "capability_intelligence",
      "provider_selection",
      "generation",
      "evaluation",
      "gateway_response",
    ],
    tags: ["research", "perplexity", "exa", "tavily"],
  },
  {
    scenarioId: "gateway_e2e",
    name: "Gateway End-to-End",
    description: "API request through Gateway to execution intelligence explainability",
    stages: [
      "organization",
      "gateway_response",
      "ai_execution",
      "explainability",
      "audit_trail",
    ],
    tags: ["gateway", "api"],
  },
];

export function getValidationScenario(
  id: ValidationScenarioDefinition["scenarioId"]
): ValidationScenarioDefinition | undefined {
  return E2E_VALIDATION_SCENARIOS.find((s) => s.scenarioId === id);
}
