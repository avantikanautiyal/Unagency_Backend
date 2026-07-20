/**
 * Pipeline coordinator — delegates to orchestrator.
 */

import type { Result } from "../../shared/result";
import type { ControlPlaneRequest } from "../contracts/request";
import type { IPipelineOrchestrator, PipelineOrchestratorResult } from "../interfaces/control-plane";

export class PipelineCoordinator {
  constructor(private readonly orchestrator: IPipelineOrchestrator) {}

  coordinate(request: ControlPlaneRequest): Promise<Result<PipelineOrchestratorResult>> {
    return this.orchestrator.execute(request);
  }
}
