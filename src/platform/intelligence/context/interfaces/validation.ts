import type { Result } from "../../shared/result";
import type {
  ContextValidationResult,
  IntelligenceContext,
} from "../contracts/intelligence-context";

export interface IContextValidator {
  validate(context: IntelligenceContext): Result<ContextValidationResult>;
}
