/**
 * Phase 7 — Delivery authorization (NO APPROVAL → NO DELIVERY; version-bound).
 */

import type { IArtifactVersionStore } from "../artifact/artifact-version-store";
import type { DeliveryAuthorizationResult } from "../contracts/delivery";
import { DeliveryError } from "../contracts/errors";
import { logOsExecutionEvent } from "../../observability/execution-log";

export class DeliveryAuthorizationService {
  readonly implementationStatus = "implemented" as const;

  constructor(private readonly artifacts: IArtifactVersionStore) {}

  authorize(input: {
    readonly organizationId: string;
    readonly artifactId: string;
    readonly artifactVersion: number;
    readonly executionId: string;
    readonly planVersion?: number;
    readonly destination: string;
    readonly allowedDestinations?: readonly string[];
  }): Promise<DeliveryAuthorizationResult> {
    return this.authorizeAsync(input);
  }

  async authorizeAsync(input: {
    readonly organizationId: string;
    readonly artifactId: string;
    readonly artifactVersion: number;
    readonly executionId: string;
    readonly planVersion?: number;
    readonly destination: string;
    readonly allowedDestinations?: readonly string[];
  }): Promise<DeliveryAuthorizationResult> {
    logOsExecutionEvent("delivery.authorization.requested", {
      requestId: input.executionId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      status: `v${input.artifactVersion}`,
      planVersion: input.planVersion,
    });

    if (!input.organizationId?.trim()) {
      throw new DeliveryError("TENANT_VIOLATION", "organizationId required");
    }

    const allowed = input.allowedDestinations ?? [
      "export",
      "storage",
      "webhook",
    ];
    if (!allowed.includes(input.destination)) {
      logOsExecutionEvent("delivery.denied", {
        requestId: input.executionId,
        executionId: input.executionId,
        organizationId: input.organizationId,
        status: "DESTINATION_UNAUTHORIZED",
      });
      return {
        authorized: false,
        reason: "Destination not authorized",
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
      };
    }

    const art = await this.artifacts.getVersion(
      input.artifactId,
      input.artifactVersion,
      input.organizationId
    );
    if (!art) {
      logOsExecutionEvent("delivery.denied", {
        requestId: input.executionId,
        executionId: input.executionId,
        organizationId: input.organizationId,
        status: "ARTIFACT_NOT_FOUND",
      });
      return {
        authorized: false,
        reason: "Artifact version not found",
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
      };
    }
    if (art.organizationId !== input.organizationId) {
      throw new DeliveryError("TENANT_VIOLATION", "tenant isolation violation");
    }
    if (art.executionId !== input.executionId) {
      logOsExecutionEvent("delivery.denied", {
        requestId: input.executionId,
        executionId: input.executionId,
        organizationId: input.organizationId,
        status: "VERSION_MISMATCH",
      });
      return {
        authorized: false,
        reason: "Artifact execution mismatch",
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
      };
    }
    if (
      typeof input.planVersion === "number" &&
      typeof art.planVersion === "number" &&
      art.planVersion !== input.planVersion
    ) {
      logOsExecutionEvent("delivery.denied", {
        requestId: input.executionId,
        executionId: input.executionId,
        organizationId: input.organizationId,
        status: "VERSION_MISMATCH",
      });
      return {
        authorized: false,
        reason: "Plan version mismatch",
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
      };
    }
    if (art.approvalState === "REVOKED") {
      logOsExecutionEvent("delivery.denied", {
        requestId: input.executionId,
        executionId: input.executionId,
        organizationId: input.organizationId,
        status: "REVOKED",
      });
      return {
        authorized: false,
        reason: "Artifact version revoked",
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
      };
    }
    if (art.approvalState !== "APPROVED") {
      logOsExecutionEvent("delivery.denied", {
        requestId: input.executionId,
        executionId: input.executionId,
        organizationId: input.organizationId,
        status: "NOT_APPROVED",
      });
      return {
        authorized: false,
        reason: "No approval → no delivery",
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
      };
    }

    logOsExecutionEvent("delivery.authorized", {
      requestId: input.executionId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      status: "AUTHORIZED",
      planVersion: art.planVersion,
    });

    return {
      authorized: true,
      reason: "Approved artifact version authorized for delivery",
      approvalReference: art.approvalReference,
      artifactId: art.artifactId,
      artifactVersion: art.version,
    };
  }
}
