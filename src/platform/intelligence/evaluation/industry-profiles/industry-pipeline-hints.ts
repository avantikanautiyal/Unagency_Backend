/**
 * Industry → pipeline family hints.
 */

import type { EvaluationPipelineFamily } from "../contracts/dynamic-evaluation";

export const INDUSTRY_PIPELINE_HINTS: Readonly<Record<string, EvaluationPipelineFamily>> = {
  healthcare: "healthcare",
  medical: "healthcare",
  legal: "legal",
  finance: "finance",
  fintech: "finance",
  retail: "marketing",
  saas: "marketing",
  technology: "software",
  software: "software",
};

export function pipelineFamilyForIndustry(industry: string): EvaluationPipelineFamily | undefined {
  return INDUSTRY_PIPELINE_HINTS[industry.toLowerCase()];
}
