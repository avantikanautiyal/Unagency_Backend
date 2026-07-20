/**
 * Production Validation Engine interfaces.
 */

import type { Result } from "../../intelligence/shared/result";
import type {
  ProductionSuiteRequest,
  ProductionSuiteReport,
  ProductionValidationRequest,
  ProductionValidationReport,
} from "../contracts/result";

export interface IProductionValidationEngine {
  validate(request: ProductionValidationRequest): Promise<Result<ProductionValidationReport>>;
  validateSuite(request: ProductionSuiteRequest): Promise<Result<ProductionSuiteReport>>;
}
