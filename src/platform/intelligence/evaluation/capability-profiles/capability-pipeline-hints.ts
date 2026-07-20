/**
 * Capability → preferred pipeline family hints.
 */

import type { EvaluationPipelineFamily } from "../contracts/dynamic-evaluation";

export const CAPABILITY_PIPELINE_HINTS: Readonly<Record<string, EvaluationPipelineFamily>> = {
  "marketing.social.carousel": "marketing",
  "marketing.copywriting": "marketing",
  "marketing.email": "marketing",
  "software.code_generation": "software",
  "software.code_review": "software",
  "software.refactoring": "software",
  "legal.contract_review": "legal",
  "finance.forecasting": "finance",
  "research.market_analysis": "research",
  "design.image_generation": "media",
  "video.short_form_generation": "media",
};

export function pipelineFamilyForCapability(capabilityId: string): EvaluationPipelineFamily | undefined {
  return CAPABILITY_PIPELINE_HINTS[capabilityId];
}
