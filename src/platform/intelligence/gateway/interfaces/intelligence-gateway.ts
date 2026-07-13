/**
 * Intelligence Gateway — sole public entry point for business modules.
 *
 * Purpose: Façade over the Intelligence Control Plane.
 * Responsibilities: invoke, control, status, health, validate — no business logic.
 * Usage: Business modules depend only on this interface.
 * Future Extension: Streaming, batch invoke.
 */

import type { Result } from "../../shared/result";
import type {
  GatewayCapabilityRequest,
  GatewayCapabilityResponse,
  GatewayExecutionStatus,
  GatewayHealthReport,
  GatewayValidateCapabilityRequest,
} from "../contracts/gateway-request";
import type { ExecutionSnapshot } from "../../execution-runtime/contracts/execution-snapshot";
import type { CapabilityDefinition } from "../../capability-registry/contracts/capability-definition";

export interface IIntelligenceGateway {
  invokeCapability(
    request: GatewayCapabilityRequest
  ): Promise<Result<GatewayCapabilityResponse>>;

  getExecution(sessionId: string): Promise<Result<ExecutionSnapshot>>;

  cancelExecution(
    sessionId: string,
    reason?: string
  ): Promise<Result<void>>;

  pauseExecution(sessionId: string): Promise<Result<void>>;

  resumeExecution(sessionId: string): Promise<Result<void>>;

  getExecutionStatus(
    sessionId: string
  ): Promise<Result<GatewayExecutionStatus>>;

  health(): Promise<Result<GatewayHealthReport>>;

  validateCapability(
    request: GatewayValidateCapabilityRequest
  ): Promise<Result<CapabilityDefinition>>;
}
