/**
 * Experiment ports — interfaces only (M3.3).
 */

import { randomUUID } from "crypto";
import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { LearningExperiment, LearningScope } from "../contracts/learning-models";
import type { IExperimentManager } from "../interfaces/learning-ports";

export interface ExperimentCreateInput {
  readonly kind: LearningExperiment["kind"];
  readonly name: string;
  readonly hypothesis?: string;
  readonly scope: LearningScope;
}

export class PlaceholderExperimentManager implements IExperimentManager {
  readonly supported = false;

  createExperiment(input: ExperimentCreateInput): Result<LearningExperiment> {
    return success({
      experimentId: `lexp_${randomUUID()}`,
      kind: input.kind,
      name: input.name,
      status: "draft",
      hypothesis: input.hypothesis,
      scope: input.scope,
      createdAt: new Date().toISOString(),
    });
  }
}
