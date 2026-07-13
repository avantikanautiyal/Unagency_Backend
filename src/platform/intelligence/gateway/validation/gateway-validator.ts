/**
 * Gateway request and capability validation.
 */

import type { ICapabilityRegistry } from "../../capability-registry/interfaces/capability-registry";
import type { CapabilityDefinition } from "../../capability-registry/contracts/capability-definition";
import {
  asCapabilityId,
  asOrganizationId,
  asWorkspaceId,
} from "../../shared/identifiers";
import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  GatewayCapabilityRequest,
  GatewayValidateCapabilityRequest,
} from "../contracts/gateway-request";
import { GatewayValidationError } from "../errors";
import type { CapabilityRequest } from "../../execution-planning/contracts/capability-request";

export interface IGatewayValidator {
  validateInvokeRequest(
    request: GatewayCapabilityRequest
  ): Result<CapabilityRequest & { input: Readonly<Record<string, unknown>> }>;

  validateCapability(
    registry: ICapabilityRegistry,
    request: GatewayValidateCapabilityRequest
  ): Result<CapabilityDefinition>;
}

export class GatewayValidator implements IGatewayValidator {
  validateInvokeRequest(
    request: GatewayCapabilityRequest
  ): Result<CapabilityRequest & { input: Readonly<Record<string, unknown>> }> {
    const issues: string[] = [];
    if (!request.capabilityId) issues.push("capabilityId is required");
    if (!request.organizationId) issues.push("organizationId is required");
    if (!request.workspaceId) issues.push("workspaceId is required");
    if (!request.input || typeof request.input !== "object") {
      issues.push("input is required");
    }

    if (issues.length > 0) {
      return failure(
        new GatewayValidationError("Invalid gateway capability request", {
          issues,
        })
      );
    }

    return success({
      capabilityId: asCapabilityId(String(request.capabilityId)),
      organizationId: asOrganizationId(String(request.organizationId)),
      workspaceId: asWorkspaceId(String(request.workspaceId)),
      capabilityVersion: request.capabilityVersion,
      inputHints: request.input,
      correlationId: request.correlationId,
      priority: request.priority,
      input: request.input,
    });
  }

  validateCapability(
    registry: ICapabilityRegistry,
    request: GatewayValidateCapabilityRequest
  ): Result<CapabilityDefinition> {
    if (!request.capabilityId) {
      return failure(
        new GatewayValidationError("capabilityId is required")
      );
    }

    const capabilityId = asCapabilityId(String(request.capabilityId));
    const resolved = registry.resolve(capabilityId, {
      version: request.capabilityVersion,
      channel: request.capabilityVersion ? undefined : "latest",
    });

    if (!resolved.ok) {
      return resolved;
    }

    const capability = resolved.value;
    if (capability.status === "disabled") {
      return failure(
        new GatewayValidationError("Capability is disabled", {
          capabilityId,
        })
      );
    }
    if (capability.status === "archived") {
      return failure(
        new GatewayValidationError("Capability is archived", {
          capabilityId,
        })
      );
    }

    return success(capability);
  }
}
