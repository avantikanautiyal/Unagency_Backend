/**
 * Validate ExecutionExperiencePackage invariants.
 */

import { success, failure, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import type { ExecutionExperiencePackage } from "../contracts/package";
import type { IInjectionValidator } from "../interfaces/experience-injection";

export class DefaultInjectionValidator implements IInjectionValidator {
  validate(pkg: ExecutionExperiencePackage): Result<boolean> {
    if (!pkg.packageId) {
      return failure(new ValidationError("packageId required"));
    }
    if (pkg.containsPromptContent !== false) {
      return failure(new ValidationError("package must not contain prompt content"));
    }
    if (pkg.advisoryOnly !== true) {
      return failure(new ValidationError("package must be advisoryOnly"));
    }
    for (const p of pkg.relevantExperiences) {
      if (!p.experience.correctionStrategy.advisoryOnly) {
        return failure(new ValidationError("corrections must be advisory only"));
      }
    }
    if (!pkg.explainability?.summary) {
      return failure(new ValidationError("explainability required"));
    }
    return success(true);
  }
}
