/**
 * Intelligence Gateway implementation.
 *
 * Purpose: Sole public façade for business modules.
 * Responsibilities: Validate → Plan → Orchestrate → Mock output → Result.
 * Usage: Obtained from PlatformCompositionRoot / bootstrapIntelligenceGateway.
 * Future Extension: Streaming, batch, auth context propagation.
 */

import type { ICapabilityRegistry } from "../../capability-registry/interfaces/capability-registry";
import type { CapabilityDefinition } from "../../capability-registry/contracts/capability-definition";
import type { IExecutionPlanningEngine } from "../../execution-planning/interfaces/execution-planning-engine";
import type { ExecutionSnapshot } from "../../execution-runtime/contracts/execution-snapshot";
import type { IExecutionRuntime } from "../../execution-runtime/interfaces/execution-runtime";
import type { IIntelligenceOrchestrator } from "../../orchestrator/interfaces/intelligence-orchestrator";
import { asExecutionId } from "../../shared/identifiers";
import type { ExecutionId } from "../../shared/identifiers";
import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  GatewayCapabilityRequest,
  GatewayCapabilityResponse,
  GatewayExecutionStatus,
  GatewayHealthReport,
  GatewayValidateCapabilityRequest,
} from "../contracts/gateway-request";
import { GatewayError } from "../errors";
import type { IGatewayHealthAggregator } from "../health/gateway-health";
import type { IIntelligenceGateway } from "../interfaces/intelligence-gateway";
import type { IGatewayMiddleware } from "../middleware/gateway-middleware";
import { applyMockCapabilityOutput } from "../mocks/mock-capability-handlers";
import type { IGatewayValidator } from "../validation/gateway-validator";

export interface IntelligenceGatewayDependencies {
  readonly validator: IGatewayValidator;
  readonly capabilityRegistry: ICapabilityRegistry;
  readonly planningEngine: IExecutionPlanningEngine;
  readonly orchestrator: IIntelligenceOrchestrator;
  readonly runtime: IExecutionRuntime;
  readonly healthAggregator: IGatewayHealthAggregator;
  readonly middleware?: readonly IGatewayMiddleware[];
  readonly nowIso?: () => string;
  readonly createExecutionId?: () => ExecutionId;
}

export class IntelligenceGateway implements IIntelligenceGateway {
  private readonly middleware: readonly IGatewayMiddleware[];
  private readonly nowIso: () => string;
  private readonly createExecutionId: () => ExecutionId;

  constructor(private readonly deps: IntelligenceGatewayDependencies) {
    this.middleware = deps.middleware ?? [];
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.createExecutionId =
      deps.createExecutionId ??
      (() =>
        asExecutionId(
          `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        ));
  }

  async invokeCapability(
    request: GatewayCapabilityRequest
  ): Promise<Result<GatewayCapabilityResponse>> {
    for (const mw of this.middleware) {
      await mw.beforeInvoke?.(request);
    }

    const validated = this.deps.validator.validateInvokeRequest(request);
    if (!validated.ok) {
      await this.afterInvoke(request, false);
      return validated;
    }

    const capabilityCheck = this.deps.validator.validateCapability(
      this.deps.capabilityRegistry,
      {
        capabilityId: validated.value.capabilityId,
        capabilityVersion: validated.value.capabilityVersion,
      }
    );
    if (!capabilityCheck.ok) {
      await this.afterInvoke(request, false);
      return capabilityCheck;
    }

    const planResult = await this.deps.planningEngine.produceExecutionPlan({
      capabilityId: validated.value.capabilityId,
      organizationId: validated.value.organizationId,
      workspaceId: validated.value.workspaceId,
      capabilityVersion: validated.value.capabilityVersion,
      inputHints: validated.value.input,
      correlationId: validated.value.correlationId,
      priority: validated.value.priority,
    });

    if (!planResult.ok) {
      await this.afterInvoke(request, false);
      return planResult;
    }

    const executionId = this.createExecutionId();
    const orchestration = await this.deps.orchestrator.orchestrate({
      plan: planResult.value,
      runtimeContext: {
        executionId,
        organizationId: validated.value.organizationId,
        workspaceId: validated.value.workspaceId,
        correlationId: validated.value.correlationId,
        attributes: {
          capabilityId: String(validated.value.capabilityId),
        },
      },
    });

    if (!orchestration.ok) {
      await this.afterInvoke(request, false);
      return failure(
        orchestration.error instanceof GatewayError
          ? orchestration.error
          : new GatewayError("Orchestration failed", {
              cause: orchestration.error,
            })
      );
    }

    const sessionId = orchestration.value.sessionId;
    if (!sessionId) {
      await this.afterInvoke(request, false);
      return failure(
        new GatewayError("Orchestration completed without sessionId")
      );
    }

    const output = applyMockCapabilityOutput(
      String(validated.value.capabilityId),
      validated.value.input,
      orchestration.value.aggregated?.output
    );

    const snapshot = await this.deps.runtime.getExecution(sessionId);
    const state = snapshot.ok ? snapshot.value.state : "completed";

    await this.afterInvoke(request, true);

    return success({
      sessionId,
      planId: planResult.value.planId,
      orchestrationId: orchestration.value.orchestrationId,
      capabilityId: String(validated.value.capabilityId),
      state,
      output,
      success: orchestration.value.status === "completed",
      message: orchestration.value.message,
    });
  }

  async getExecution(sessionId: string): Promise<Result<ExecutionSnapshot>> {
    return this.deps.runtime.getExecution(sessionId);
  }

  async cancelExecution(
    sessionId: string,
    reason?: string
  ): Promise<Result<void>> {
    return this.deps.runtime.cancelExecution(sessionId, reason);
  }

  async pauseExecution(sessionId: string): Promise<Result<void>> {
    return this.deps.runtime.pauseExecution(sessionId);
  }

  async resumeExecution(sessionId: string): Promise<Result<void>> {
    return this.deps.runtime.resumeExecution(sessionId);
  }

  async getExecutionStatus(
    sessionId: string
  ): Promise<Result<GatewayExecutionStatus>> {
    const snapshot = await this.deps.runtime.getExecution(sessionId);
    if (!snapshot.ok) {
      return snapshot;
    }

    return success({
      sessionId,
      state: snapshot.value.state,
      metrics: snapshot.value.metrics,
      currentNodeId: snapshot.value.currentNodeId,
    });
  }

  async health(): Promise<Result<GatewayHealthReport>> {
    return this.deps.healthAggregator.check();
  }

  async validateCapability(
    request: GatewayValidateCapabilityRequest
  ): Promise<Result<CapabilityDefinition>> {
    return this.deps.validator.validateCapability(
      this.deps.capabilityRegistry,
      request
    );
  }

  private async afterInvoke(
    request: GatewayCapabilityRequest,
    ok: boolean
  ): Promise<void> {
    for (const mw of this.middleware) {
      await mw.afterInvoke?.(request, ok);
    }
  }
}
