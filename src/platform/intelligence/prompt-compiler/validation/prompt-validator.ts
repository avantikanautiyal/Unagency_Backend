/**
 * Prompt document constraint validation.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { PromptDocument } from "../contracts/prompt-models";
import { PromptValidationError } from "../errors";
import type { IPromptValidator } from "../interfaces/prompt-ports";

export class PromptValidator implements IPromptValidator {
  async validate(document: PromptDocument): Promise<Result<PromptDocument>> {
    const issues: string[] = [];
    const roles = new Set(document.ast.sections.map((s) => s.role));

    for (const constraint of document.ast.constraints) {
      if (constraint.kind === "required_section") {
        const role = String(constraint.value);
        if (!roles.has(role as never)) {
          issues.push(`Missing required section: ${role}`);
        }
      }
      if (constraint.kind === "max_sections") {
        const max = Number(constraint.value);
        if (document.ast.sections.length > max) {
          issues.push(`Too many sections: ${document.ast.sections.length} > ${max}`);
        }
      }
      if (constraint.kind === "required_variable") {
        const name = String(constraint.value);
        const present = document.ast.variables.some((v) => v.name === name);
        if (!present) {
          issues.push(`Missing required variable: ${name}`);
        }
      }
    }

    if (document.ast.sections.length === 0) {
      issues.push("Document has no sections");
    }

    if (issues.length > 0) {
      return failure(
        new PromptValidationError("Prompt validation failed", { issues })
      );
    }

    return success(document);
  }
}
