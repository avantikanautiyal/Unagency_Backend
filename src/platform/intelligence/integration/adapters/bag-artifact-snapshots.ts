/**
 * Build learning artifact snapshots from real integration pipeline outputs.
 */

import { createArtifactEngine } from "../../artifacts/factories/create-artifact-engine";
import { ArtifactInputBuilder } from "../../artifacts/builders/artifact-input-builder";
import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import type { BridgeContext } from "../interfaces/integration";
import type { IntegrationArtifactBag } from "../contracts/artifacts";
import {
  extractIntegrationOutputText,
  resolveIntegrationTenant,
} from "./integration-tenant-scope";

export async function buildBagArtifactSnapshots(
  ctx: BridgeContext,
  bag: IntegrationArtifactBag
): Promise<ArtifactSnapshot[]> {
  const engine = createArtifactEngine();
  const tenant = resolveIntegrationTenant({
    request: ctx.request,
    requestId: ctx.requestId,
    bag,
  });
  const scope = {
    organizationId: tenant.organizationId,
    workspaceId: tenant.workspaceId,
    executionId: tenant.executionId,
    capabilityId: tenant.capabilityId,
    userId: tenant.userId,
    correlationId: ctx.correlationId,
  };

  const snapshots: ArtifactSnapshot[] = [];
  const outputText = extractIntegrationOutputText(bag);
  const success = bag.runtime?.success ?? true;
  const sessionId = bag.runtime?.sessionId ?? `${ctx.requestId}_session`;

  const executionResult = await engine.create(
    ArtifactInputBuilder.create()
      .withType("execution")
      .withScope(scope)
      .withPayload({
        execution: {
          sessionId,
          state: success ? "completed" : "failed",
          success,
          output: outputText ? { message: outputText } : bag.runtime?.response?.output,
          completedAt: new Date().toISOString(),
        },
      })
      .withSourceModule("integration-runtime")
      .build()
  );
  if (executionResult.ok) {
    snapshots.push(executionResult.value.snapshot);
  }

  if (bag.evaluation?.report) {
    const evaluationResult = await engine.create(
      ArtifactInputBuilder.create()
        .withType("evaluation")
        .withScope(scope)
        .withPayload({ evaluation: bag.evaluation.report })
        .withSourceModule("evaluation")
        .build()
    );
    if (evaluationResult.ok) {
      snapshots.push(evaluationResult.value.snapshot);
    }
  }

  return snapshots;
}
