/**
 * Experience validator.
 */

import { success, failure, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import type { Experience } from "../contracts/experience";
import type { IExperienceValidator } from "../interfaces/experience-intelligence";

export class DefaultExperienceValidator implements IExperienceValidator {
  validate(experience: Experience): Result<boolean> {
    if (!experience.experienceId) {
      return failure(new ValidationError("experienceId required"));
    }
    if (!experience.rootCause) {
      return failure(new ValidationError("rootCause required"));
    }
    if (!experience.correctionStrategy?.advisoryOnly) {
      return failure(new ValidationError("corrections must be advisory only"));
    }
    if (!experience.explanation?.whyExists) {
      return failure(new ValidationError("explanation required"));
    }
    return success(true);
  }
}
