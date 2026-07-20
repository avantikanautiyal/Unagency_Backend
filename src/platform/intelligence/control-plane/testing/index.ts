/**
 * Control Plane testing utilities.
 */

import { ControlPlaneRequestBuilder } from "../builders/control-plane-request-builder";
import {
  createIntelligenceControlPlane,
  type IntelligenceControlPlanePlatform,
  type CreateIntelligenceControlPlaneOptions,
} from "../factories/create-intelligence-control-plane";

export function sampleSneakerLaunchControlPlaneRequest() {
  return ControlPlaneRequestBuilder.create()
    .withRequestId("cp_req_sneaker_launch")
    .withRawPrompt("Launch our new sneaker collection")
    .withScenarioHint("retail product launch")
    .withBudgetLimit(500)
    .withTokenBudgetLimit(500000)
    .withRegionHint("us")
    .build();
}

export function deterministicHelpers() {
  let id = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    clockMs: () => (ms += 2),
  };
}

export function setupIntelligenceControlPlane(
  options: CreateIntelligenceControlPlaneOptions = {}
): IntelligenceControlPlanePlatform {
  const helpers = deterministicHelpers();
  return createIntelligenceControlPlane({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}
