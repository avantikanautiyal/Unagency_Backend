/**
 * Validation Platform public interfaces.
 */

import type { Result } from "../../intelligence/shared/result";
import type { ValidationReportBundle, ValidationRunReport, ValidationRunRequest } from "../contracts";

export interface IValidationOrchestrator {
  run(request: ValidationRunRequest): Promise<Result<ValidationRunReport>>;
  runWithReports(request: ValidationRunRequest): Promise<Result<ValidationReportBundle>>;
}
