/**
 * Auto-deliver primary artifact when execution succeeds (export destination).
 */

import type { OsDeliveryService } from "../../os/delivery/engine/delivery-service";
import type { ExecutionArtifactRef } from "../contracts";

export async function maybeAutoDeliverOnSuccess(input: {
  readonly deliveryService: OsDeliveryService;
  readonly organizationId: string;
  readonly executionId: string;
  readonly artifactRefs: readonly ExecutionArtifactRef[];
  readonly nowIso: () => string;
  readonly createId: (prefix: string) => string;
}): Promise<{ readonly deliveryId?: string; readonly error?: string }> {
  const primary =
    input.artifactRefs.find((a) => a.kind === "media") ??
    input.artifactRefs.find((a) => a.kind === "response") ??
    input.artifactRefs[0];
  if (!primary?.artifactId) {
    return {};
  }

  try {
    const auth = await input.deliveryService.authorize({
      organizationId: input.organizationId,
      artifactId: primary.artifactId,
      artifactVersion: 1,
      executionId: input.executionId,
      destination: "export",
    });
    if (!auth.authorized) {
      return { error: auth.reason ?? "delivery_not_authorized" };
    }

    const receipt = await input.deliveryService.createDelivery({
      organizationId: input.organizationId,
      artifactId: primary.artifactId,
      artifactVersion: 1,
      executionId: input.executionId,
      destination: "export",
      deliveryIntent: "auto_on_success",
      nowIso: input.nowIso,
      createId: input.createId,
    });
    return { deliveryId: receipt.deliveryId };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "auto_delivery_failed",
    };
  }
}
