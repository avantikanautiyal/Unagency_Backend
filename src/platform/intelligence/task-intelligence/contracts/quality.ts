/**
 * Quality requirement contracts.
 */

import type { QualityLevel } from "./enums";

export interface QualityRequirements {
  readonly creativityLevel: QualityLevel;
  readonly accuracyLevel: QualityLevel;
  readonly brandConsistency: QualityLevel;
  readonly complianceRequired: boolean;
  readonly researchDepth: QualityLevel;
  readonly formattingStrict: boolean;
  readonly citationRequired: boolean;
  readonly reviewRequired: boolean;
  readonly rationale: string;
}
