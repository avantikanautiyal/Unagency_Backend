/**
 * Intelligence OS Integration Engine — thin facade over the bridge pipeline.
 */

import type { Result } from "../../shared/result";
import type { IntelligenceOsIntegrationRequest } from "../contracts/request";
import type { IntelligenceOsIntegrationReport } from "../contracts/result";
import type {
  IIntelligenceOsIntegrationEngine,
  IIntegrationPipeline,
} from "../interfaces/integration";

export interface IntelligenceOsIntegrationEngineDeps {
  readonly pipeline: IIntegrationPipeline;
}

export class IntelligenceOsIntegrationEngine implements IIntelligenceOsIntegrationEngine {
  constructor(private readonly deps: IntelligenceOsIntegrationEngineDeps) {}

  run(request: IntelligenceOsIntegrationRequest): Promise<Result<IntelligenceOsIntegrationReport>> {
    return this.deps.pipeline.execute(request);
  }
}
