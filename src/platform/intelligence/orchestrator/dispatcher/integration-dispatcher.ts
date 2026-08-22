/**
 * Integration Dispatcher — routes orchestrator dispatch through the
 * production IntelligenceOsIntegrationEngine, then drives the runtime
 * session to the correct terminal state based on the pipeline result.
 *
 * Flow:
 *   1. Create a real ExecutionSession via IExecutionRuntime.createSession()
 *   2. Start it (transitions: created → running)
 *   3. Call IIntelligenceOsIntegrationEngine.run() with the pipeline request
 *   4. Complete or fail the session based on the pipeline result
 *      — carrying the real AI output in the session result
 */

import type { IIntelligenceOsIntegrationEngine } from "../../integration/interfaces/integration";
import type { IExecutionRuntime } from "../../execution-runtime/interfaces/execution-runtime";
import type { IExecutionSession } from "../../execution-runtime/contracts/execution-session";
import { failure } from "../../shared/result";
import type { Result } from "../../shared/result";
import { OrchestratorValidationError } from "../errors";
import type { IExecutionDispatcher, DispatchTarget } from "./execution-dispatcher";
import type { OrganizationId, WorkspaceId } from "../../shared/identifiers";

/** Session output key — full pipeline report for API layer reconstruction. */
export const INTEGRATION_REPORT_SESSION_KEY = "integrationReport";

export class IntegrationDispatcher implements IExecutionDispatcher {
  constructor(
    private readonly integration: IIntelligenceOsIntegrationEngine,
    private readonly runtime: IExecutionRuntime,
  ) {}

  async dispatch(target: DispatchTarget): Promise<Result<IExecutionSession>> {
    if (!target.plan.planId || !target.plan.graph?.nodes?.length) {
      return failure(
        new OrchestratorValidationError("Cannot dispatch invalid plan", {
          planId: target.plan.planId,
        })
      );
    }

    if (!target.runtimeContext.executionId) {
      return failure(
        new OrchestratorValidationError("runtimeContext.executionId is required")
      );
    }

    // Step 1 — create session only (do NOT use executePlan — that runs the
    // placeholder walker and leaves the session terminal before integration).
    const sessionResult = await this.runtime.createSession({
      context: target.runtimeContext,
      plan: target.plan,
    });

    if (!sessionResult.ok) {
      return sessionResult;
    }

    const session = sessionResult.value;

    // Step 2 — start the session lifecycle
    try {
      await session.start();
    } catch (error) {
      return failure(
        error instanceof Error
          ? error
          : new Error("Failed to start integration session")
      );
    }

    // Step 3 — run the full 13-stage integration pipeline
    const rawPrompt =
      (target.runtimeContext.attributes?.["rawPrompt"] as string | undefined) ??
      (target.plan.metadata.attributes?.["rawPrompt"] as string | undefined) ??
      "";

    const integrationResult = await this.integration.run({
      requestId: String(target.runtimeContext.executionId),
      rawPrompt,
      organizationId: target.runtimeContext.organizationId as OrganizationId | undefined,
      workspaceId: target.runtimeContext.workspaceId as WorkspaceId | undefined,
      correlationId: target.runtimeContext.correlationId,
      metadata: {
        ...(target.runtimeContext.attributes ?? {}),
        planId: target.plan.planId,
        executionId: String(target.runtimeContext.executionId),
        capabilityId: target.runtimeContext.attributes?.["capabilityId"],
      },
    });

    // Step 4 — drive session to terminal state.
    // Always attach the integration report (success or failure) so the API can
    // surface real provider errors instead of "without integration report".
    if (!integrationResult.ok) {
      await session.fail(
        integrationResult.error.message ?? "Integration pipeline failed",
        integrationResult.error.code,
      );
    } else {
      const report = integrationResult.value;
      const reportOutput = {
        integrationResultId: report.resultId,
        stagesCompleted: report.stagesCompleted,
        durationMs: report.durationMs,
        providerOutput: report.artifacts?.runtime?.response?.output ?? {},
        [INTEGRATION_REPORT_SESSION_KEY]: report,
      };
      if (report.success) {
        await session.complete(reportOutput);
      } else {
        await session.fail(
          "Integration pipeline completed without success",
          "INTEGRATION_PIPELINE_FAILED",
          reportOutput,
        );
      }
    }

    return sessionResult;
  }
}
