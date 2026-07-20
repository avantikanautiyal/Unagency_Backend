/**
 * Pipeline simulator — dry-run reporting.
 */

import { success, type Result } from "../../shared/result";
import type { ControlPlaneRequest } from "../contracts/request";
import type { PipelineSimulationReport } from "../contracts/simulation";
import type { ControlPlaneStatistics } from "../contracts/result";
import type { IPipelineSimulator } from "../interfaces/control-plane";
import { PIPELINE_STAGE_ORDER } from "../constants";

export class DefaultPipelineSimulator implements IPipelineSimulator {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  simulate(
    _request: ControlPlaneRequest,
    stats: ControlPlaneStatistics
  ): Result<PipelineSimulationReport> {
    return success({
      reportId: this.createId("sim"),
      mode: "dry_run",
      stagesSimulated: [...PIPELINE_STAGE_ORDER],
      planningState: {
        currentStage: "complete",
        stagesCompleted: [...PIPELINE_STAGE_ORDER],
        totalDurationMs: stats.totalDurationMs,
      },
      estimatedDurationMs: stats.totalDurationMs,
      providerExecution: false,
      rationale: "Full pipeline simulated without provider execution",
    });
  }
}
