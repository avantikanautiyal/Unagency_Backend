/**
 * Calibration ports — interfaces only, no learning (M3.1).
 */

import type { Result } from "../../shared/result";
import type { EvaluationReport } from "../contracts/evaluation-models";

export interface CalibrationSample {
  readonly reportId: string;
  readonly expectedScore: number;
  readonly actualScore: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CalibrationAdjustment {
  readonly criterionId: string;
  readonly offset: number;
  readonly rationale?: string;
}

export interface CalibrationProfile {
  readonly profileId: string;
  readonly version: string;
  readonly adjustments: readonly CalibrationAdjustment[];
}

export interface ICalibrationStore {
  saveSample(sample: CalibrationSample): Promise<Result<void>>;
  listSamples(limit?: number): Promise<Result<readonly CalibrationSample[]>>;
}

export interface ICalibrationEngine {
  readonly supported: boolean;
  loadProfile(profileId: string): Promise<Result<CalibrationProfile>>;
  calibrate(report: EvaluationReport): Promise<Result<EvaluationReport>>;
}
