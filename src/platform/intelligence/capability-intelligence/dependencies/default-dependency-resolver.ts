/**
 * Dependency resolution — expands required transitive dependencies.
 */

import { success, type Result } from "../../shared/result";
import type { CapabilityDefinitionRecord } from "../contracts/capability";
import type { CapabilityDependencies } from "../contracts/graph";
import type {
  ICapabilityRegistry,
  IDependencyResolver,
} from "../interfaces/capability-intelligence";

export class DefaultDependencyResolver implements IDependencyResolver {
  resolve(
    capabilities: readonly CapabilityDefinitionRecord[],
    registry: ICapabilityRegistry
  ): Result<CapabilityDependencies> {
    const edges: CapabilityDependencies["edges"][number][] = [];
    const resolved = new Set(capabilities.map((c) => c.capabilityId));
    const unresolved: string[] = [];
    const queue = [...capabilities];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const depId of current.dependencies) {
        edges.push({
          capabilityId: current.capabilityId,
          dependsOn: depId,
          required: true,
          reason: `${current.capabilityId} declares dependency on ${depId}`,
        });

        if (resolved.has(depId)) continue;

        const got = registry.get(depId);
        if (!got.ok) return got;
        if (!got.value) {
          unresolved.push(depId);
          continue;
        }
        resolved.add(depId);
        queue.push(got.value);
      }
    }

    return success({
      edges,
      unresolved: [...new Set(unresolved)],
      resolved: [...resolved],
    });
  }
}
