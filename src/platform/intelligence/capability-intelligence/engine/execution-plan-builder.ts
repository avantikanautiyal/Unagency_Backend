/**
 * Build CapabilityExecutionPlan from bundle + graph.
 */

import { success, type Result } from "../../shared/result";
import type { CapabilityIntelligenceRequest } from "../contracts/request";
import type { CapabilityBundle, CapabilityGraph } from "../contracts/graph";
import type { CapabilityExecutionPlan } from "../contracts/result";
import type { IExecutionPlanBuilder } from "../interfaces/capability-intelligence";
import { asCapabilityExecutionPlanId } from "../contracts/identifiers";
import { CAPABILITY_INTELLIGENCE_VERSION } from "../constants";

export class DefaultExecutionPlanBuilder implements IExecutionPlanBuilder {
  private readonly nowIso: () => string;
  private readonly createId: (prefix: string) => string;

  constructor(
    nowIso: () => string = () => new Date().toISOString(),
    createId: (prefix: string) => string = (p) => `${p}_${Date.now()}`
  ) {
    this.nowIso = nowIso;
    this.createId = createId;
  }

  build(
    request: CapabilityIntelligenceRequest,
    bundle: CapabilityBundle,
    graph: CapabilityGraph
  ): Result<CapabilityExecutionPlan> {
    const stepByCap = new Map<string, string>();
    const steps = graph.topologicalOrder.map((capabilityId, index) => {
      const stepId = `step_${index + 1}_${capabilityId}`;
      stepByCap.set(capabilityId, stepId);
      const node = graph.nodes.find((n) => n.capabilityId === capabilityId);
      const member = bundle.members.find((m) => m.capabilityId === capabilityId);
      const dependsOnStepIds = (member?.dependencies ?? [])
        .map((d) => stepByCap.get(d))
        .filter((x): x is string => Boolean(x));

      return {
        stepId,
        order: index + 1,
        capabilityId,
        stage: node?.stage ?? index,
        dependsOnStepIds,
        rationale: `Execute capability ${capabilityId} as step ${index + 1} in ${graph.shape} composition.`,
      };
    });

    return success({
      planId: asCapabilityExecutionPlanId(this.createId("cap_plan")),
      requestId: request.requestId,
      businessObjective: request.businessObjective,
      bundleId: bundle.bundleId,
      shape: graph.shape,
      steps,
      capabilityIds: [...graph.topologicalOrder],
      graph,
      version: CAPABILITY_INTELLIGENCE_VERSION,
      createdAt: this.nowIso(),
      explanation: `Capability execution plan for "${request.businessObjective}" with ${steps.length} capability step(s) shaped as ${graph.shape}. Business modules request capabilities — not providers.`,
    });
  }
}
