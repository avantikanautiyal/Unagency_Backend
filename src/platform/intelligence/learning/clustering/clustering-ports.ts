/**
 * Clustering ports — interfaces only (M3.3).
 */

import type { Result } from "../../shared/result";
import type { LearningSignal } from "../contracts/learning-models";
import type { IClusteringEngine } from "../interfaces/learning-ports";

export class PlaceholderClusteringEngine implements IClusteringEngine {
  readonly supported = false;

  cluster(_signals: readonly LearningSignal[]): Result<readonly LearningSignal[][]> {
    return { ok: true, value: [] };
  }
}
