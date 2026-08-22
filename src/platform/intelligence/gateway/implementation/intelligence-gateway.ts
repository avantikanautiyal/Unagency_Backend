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
import {
  asExecutionId,
  asOrganizationId,
  asWorkspaceId,
  type ExecutionId,
} from "../../shared/identifiers";
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
import type { IGatewayValidator } from "../validation/gateway-validator";
import type { IAuthorizationPolicy } from "../../security";
import type {
  IAuditLogger,
  IDataClassifier,
  ITrustGate,
} from "../../security/interfaces/security";
import { AuthorizationError } from "../../shared/errors";

export interface IntelligenceGatewayDependencies {
  readonly validator: IGatewayValidator;
  readonly capabilityRegistry: ICapabilityRegistry;
  readonly planningEngine: IExecutionPlanningEngine;
  readonly orchestrator: IIntelligenceOrchestrator;
  readonly runtime: IExecutionRuntime;
  readonly healthAggregator: IGatewayHealthAggregator;
  readonly authorization: IAuthorizationPolicy;
  readonly trustGate?: ITrustGate;
  readonly classifier?: IDataClassifier;
  readonly auditLogger?: IAuditLogger;
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

    const securityContext = {
      organizationId: asOrganizationId(String(validated.value.organizationId)),
      workspaceId: asWorkspaceId(String(validated.value.workspaceId)),
      actorType: "integration" as const,
      correlationId: validated.value.correlationId,
    };

    if (this.deps.trustGate) {
      const trusted = await this.deps.trustGate.assertTrusted(
        securityContext,
        "capability.invoke"
      );
      if (!trusted.ok) {
        await this.afterInvoke(request, false);
        return trusted;
      }
    }

    // Basic tenant-scoped authorization (deny-by-default until principal/roles
    // plumbing is fully wired).
    const auth = await this.deps.authorization.authorize({
      context: securityContext,
      action: "capability.invoke",
      resourceType: "capability",
      resourceId: String(validated.value.capabilityId),
    });
    if (!auth.ok) {
      await this.afterInvoke(request, false);
      return failure(new AuthorizationError("Authorization policy failed", { cause: auth.error }));
    }
    if (!auth.value.allowed) {
      await this.afterInvoke(request, false);
      return failure(
        new AuthorizationError("Authorization denied", {
          reason: auth.value.reason,
        })
      );
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
      console.warn(
        `🧠 [AI OS] gateway planning failed | ${planResult.error.message} | capability=${String(validated.value.capabilityId)}`
      );
      await this.afterInvoke(request, false);
      return planResult;
    }

    const input = validated.value.input;
    const rawPrompt =
      typeof input.rawPrompt === "string"
        ? input.rawPrompt
        : typeof input.prompt === "string"
          ? input.prompt
          : "";

    let ingressAttributes: Record<string, unknown> = { ...input, rawPrompt };
    if (this.deps.classifier && rawPrompt.trim()) {
      const dataClassification = this.deps.classifier.classify(rawPrompt);
      ingressAttributes = {
        ...ingressAttributes,
        dataClassification,
        rawPrompt:
          dataClassification === "pii" || dataClassification === "restricted"
            ? this.deps.classifier.redact(rawPrompt, dataClassification)
            : rawPrompt,
      };
      if (this.deps.auditLogger) {
        await this.deps.auditLogger.log({
          action: "gateway.data_classified",
          context: securityContext,
          resourceType: "capability",
          resourceId: String(validated.value.capabilityId),
          outcome: "success",
          occurredAt: this.nowIso(),
          details: { dataClassification },
        });
      }
    }

    const apiExecutionId =
      typeof input.apiExecutionId === "string"
        ? input.apiExecutionId
        : typeof input.executionId === "string"
          ? input.executionId
          : undefined;
    const executionId = apiExecutionId
      ? asExecutionId(apiExecutionId)
      : this.createExecutionId();

    const orchestration = await this.deps.orchestrator.orchestrate({
      plan: planResult.value,
      runtimeContext: {
        executionId,
        organizationId: validated.value.organizationId,
        workspaceId: validated.value.workspaceId,
        correlationId: validated.value.correlationId,
        attributes: {
          ...ingressAttributes,
          capabilityId: String(validated.value.capabilityId),
          ...(apiExecutionId
            ? { apiExecutionId, executionId: apiExecutionId }
            : {}),
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

    // Use the real aggregated output from the orchestrator/integration pipeline.
    // Falls back to the raw input echo only when aggregated output is absent
    // (e.g. planning-only runs that produce no provider output).
    const output: Readonly<Record<string, unknown>> =
      orchestration.value.aggregated?.output ??
      { capabilityId: String(validated.value.capabilityId), echo: validated.value.input };

    const snapshot = await this.deps.runtime.getExecution(sessionId);
    const state = snapshot.ok ? snapshot.value.state : "completed";
    const invokeOk =
      orchestration.value.status === "completed" &&
      orchestration.value.aggregated?.success !== false;

    await this.afterInvoke(request, invokeOk);

    return success({
      sessionId,
      planId: planResult.value.planId,
      orchestrationId: orchestration.value.orchestrationId,
      capabilityId: String(validated.value.capabilityId),
      state,
      output,
      success: invokeOk,
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
