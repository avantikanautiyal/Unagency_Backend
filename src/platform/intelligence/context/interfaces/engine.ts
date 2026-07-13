/**
 * Context Intelligence Engine port.
 */

import type { Result } from "../../shared/result";
import type { ContextBuildRequest } from "../contracts/context-build-request";
import type {
  ContextSnapshot,
  IntelligenceContext,
} from "../contracts/intelligence-context";

export interface IContextIntelligenceEngine {
  build(request: ContextBuildRequest): Promise<Result<IntelligenceContext>>;
  snapshot(request: ContextBuildRequest): Promise<Result<ContextSnapshot>>;
}
