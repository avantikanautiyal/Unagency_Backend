/**
 * Capability discovery from business objective + optional plans.
 */

import { success, type Result } from "../../shared/result";
import type { CapabilityDefinitionRecord } from "../contracts/capability";
import type { CapabilityIntelligenceRequest } from "../contracts/request";
import type {
  ICapabilityDiscoverer,
  ICapabilityRegistry,
} from "../interfaces/capability-intelligence";

export class DefaultCapabilityDiscoverer implements ICapabilityDiscoverer {
  discover(
    registry: ICapabilityRegistry,
    request: CapabilityIntelligenceRequest
  ): Result<readonly CapabilityDefinitionRecord[]> {
    const preferred: CapabilityDefinitionRecord[] = [];
    for (const id of request.preferredCapabilityIds ?? []) {
      const got = registry.get(id);
      if (!got.ok) return got;
      if (got.value) preferred.push(got.value);
    }

    const fromPlans = extractPlanCapabilityIds(request);
    for (const id of fromPlans) {
      if (preferred.some((p) => p.capabilityId === id)) continue;
      const got = registry.get(id);
      if (!got.ok) return got;
      if (got.value) preferred.push(got.value);
    }

    const searched = registry.search(request.discovery ?? {}, request.businessObjective);
    if (!searched.ok) return searched;

    const merged = mergeUnique([...preferred, ...searched.value]);
    // Cap discovery set; composer/dependency resolver expand further.
    return success(merged.slice(0, 12));
  }
}

function extractPlanCapabilityIds(request: CapabilityIntelligenceRequest): string[] {
  const ids: string[] = [];
  const map = request.taskPlan?.capabilityRequirements;
  if (map) {
    ids.push(String(map.primary));
    for (const r of map.requirements) {
      ids.push(String(r.capabilityId));
    }
  }
  const exec = request.taskPlan?.taskExecutionPlan?.requiredCapabilities;
  if (exec) {
    for (const c of exec) ids.push(String(c));
  }
  return ids;
}

function mergeUnique(
  caps: readonly CapabilityDefinitionRecord[]
): CapabilityDefinitionRecord[] {
  const seen = new Set<string>();
  const out: CapabilityDefinitionRecord[] = [];
  for (const c of caps) {
    if (seen.has(c.capabilityId)) continue;
    seen.add(c.capabilityId);
    out.push(c);
  }
  return out;
}
