/**
 * Resolves evaluation rubrics from request hints.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { EvaluationRequest, EvaluationRubric } from "../contracts/evaluation-models";
import { EvaluationNotFoundError } from "../errors";
import type { IRubricResolver } from "../interfaces/evaluation-ports";
import { DEFAULT_EVALUATION_RUBRIC, resolveRubricById } from "../rubrics/default-rubric";

export class DefaultRubricResolver implements IRubricResolver {
  resolve(request: EvaluationRequest): Result<EvaluationRubric> {
    if (request.rubric) {
      return success(request.rubric);
    }
    if (request.rubricId) {
      const rubric = resolveRubricById(request.rubricId);
      if (!rubric) {
        return failure(
          new EvaluationNotFoundError(`Rubric not found: ${request.rubricId}`)
        );
      }
      return success(rubric);
    }
    return success(DEFAULT_EVALUATION_RUBRIC);
  }
}
