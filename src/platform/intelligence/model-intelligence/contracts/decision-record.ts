/**
 * Model Decision Record — first-class artifact for downstream platforms.
 */

import type { ModelDecisionRecordId } from "./identifiers";
import type { DepartmentKind } from "./enums";
import type { RankedModelCandidate } from "./recommendation";
import type { CapabilityId } from "../../shared/identifiers";

export interface ModelDecisionRecord {
  readonly recordId: ModelDecisionRecordId;
  readonly capabilityId: CapabilityId;
  readonly department?: DepartmentKind;
  readonly candidateModels: readonly RankedModelCandidate[];
  readonly rankingScores: Readonly<Record<string, number>>;
  readonly rankingExplanation: string;
  readonly winningModel: RankedModelCandidate;
  readonly fallbackModels: readonly RankedModelCandidate[];
  readonly expectedCost: number;
  readonly expectedTokens: number;
  readonly expectedLatencyMs: number;
  readonly expectedQuality: number;
  readonly expectedConfidence: number;
  readonly reasonForSelection: string;
  readonly policyDecisions: readonly string[];
  readonly constraintDecisions: readonly string[];
  readonly timestamp: string;
  readonly version: string;
}
