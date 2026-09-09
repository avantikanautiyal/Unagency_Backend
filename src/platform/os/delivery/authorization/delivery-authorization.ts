/**
 * Phase 7 — Delivery authorization (NO APPROVAL → NO DELIVERY; version-bound).
 * Phase B/3 — Format & Production Spec release gate required when Spec context exists.
 */

import type { IArtifactVersionStore } from "../artifact/artifact-version-store";
import type { DeliveryAuthorizationResult } from "../contracts/delivery";
import { DeliveryError } from "../contracts/errors";
import { logOsExecutionEvent } from "../../observability/execution-log";
import {
  buildProductionGateFromExecutionContext,
  evaluateProductionReleaseGate,
  type EvaluateProductionReleaseGateInput,
} from "../../../config/format-production-spec";
import {
  productionSpecObservesOnly,
  productionSpecShouldEnforce,
  resolveProductionSpecRollout,
} from "../../../config/format-production-spec/production-spec-rollout";
import { logProductionSpecTelemetry } from "../../../config/format-production-spec/production-spec-telemetry";
import { readProductionSpecBinding } from "../../../config/format-production-spec/production-binding";

export type DeliveryProductionGateInput = EvaluateProductionReleaseGateInput;

function hasSpecContext(
  metadata?: Readonly<Record<string, unknown>>,
  gate?: DeliveryProductionGateInput,
): boolean {
  if (gate?.service || gate?.platform || gate?.formatId || gate?.placementId) {
    return true;
  }
  if (!metadata) return false;
  for (const key of [
    "service",
    "platform",
    "format",
    "formatId",
    "placementId",
    "productionRuleId",
    "productionSpecBinding",
  ]) {
    const v = metadata[key];
    if (typeof v === "string" && v.trim()) return true;
    if (v && typeof v === "object") return true;
  }
  return false;
}

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
    readonly productionGate?: DeliveryProductionGateInput;
    readonly executionMetadata?: Readonly<Record<string, unknown>>;
    /**
     * When true (default), Spec-matched jobs cannot skip the production gate.
     */
    readonly enforceProductionSpec?: boolean;
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
    readonly productionGate?: DeliveryProductionGateInput;
    readonly executionMetadata?: Readonly<Record<string, unknown>>;
    readonly enforceProductionSpec?: boolean;
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

    const productionGate =
      input.productionGate ??
      buildProductionGateFromExecutionContext(input.executionMetadata);

    const rollout = resolveProductionSpecRollout();
    const gateService =
      productionGate?.service ??
      (typeof input.executionMetadata?.service === "string"
        ? input.executionMetadata.service
        : undefined);
    const rolloutEnforces = productionSpecShouldEnforce({
      service: gateService,
      rollout,
    });
    const observeOnly = productionSpecObservesOnly({
      service: gateService,
      rollout,
    });
    /** Caller can still force-disable; cannot force-enable past rollout off/shadow. */
    const enforceSpec =
      input.enforceProductionSpec !== false && rolloutEnforces;

    if (productionGate) {
      const gate = evaluateProductionReleaseGate(productionGate);
      const binding = readProductionSpecBinding(input.executionMetadata);
      logProductionSpecTelemetry({
        event: "production_spec.gate",
        organizationId: input.organizationId,
        executionId: input.executionId,
        requestId: input.executionId,
        productionRuleId: gate.rule?.id ?? binding?.productionRuleId,
        promptBlockHash: binding?.promptBlockHash,
        authorityStatus: gate.rule?.status ?? binding?.authorityStatus,
        service: gateService,
        platform: productionGate.platform,
        rollout,
        enforced: enforceSpec,
        observeOnly: observeOnly || !enforceSpec,
        allowed: gate.allowed,
        decision: gate.decision,
        status: gate.allowed
          ? "PASS"
          : enforceSpec
            ? "BLOCK"
            : "SHADOW_WOULD_BLOCK",
        reason: gate.reasons[0],
      });

      if (!gate.allowed && enforceSpec) {
        const reason =
          gate.reasons[0] ??
          `Production release ${gate.decision} by Format & Production Spec gate`;
        logOsExecutionEvent("delivery.denied", {
          requestId: input.executionId,
          executionId: input.executionId,
          organizationId: input.organizationId,
          status: "PRODUCTION_RELEASE_HOLD",
        });
        return {
          authorized: false,
          reason,
          artifactId: input.artifactId,
          artifactVersion: input.artifactVersion,
        };
      }
    } else if (
      enforceSpec &&
      hasSpecContext(input.executionMetadata, input.productionGate)
    ) {
      logOsExecutionEvent("delivery.denied", {
        requestId: input.executionId,
        executionId: input.executionId,
        organizationId: input.organizationId,
        status: "PRODUCTION_GATE_REQUIRED",
      });
      return {
        authorized: false,
        reason:
          "Production Spec gate required for delivery when service/platform context is present",
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
