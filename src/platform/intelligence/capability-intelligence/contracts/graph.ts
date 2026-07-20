/**
 * Capability graph, dependencies, bundles.
 */

import type { CompositionShape } from "./enums";
import type { CapabilityBundleId, CapabilityGraphId } from "./identifiers";
import type { CapabilityDefinitionRecord } from "./capability";

export interface CapabilityGraphNode {
  readonly nodeId: string;
  readonly capabilityId: string;
  readonly stage: number;
  readonly optional: boolean;
}

export interface CapabilityGraphEdge {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: "depends_on" | "feeds" | "optional";
}

export interface CapabilityGraph {
  readonly graphId: CapabilityGraphId;
  readonly nodes: readonly CapabilityGraphNode[];
  readonly edges: readonly CapabilityGraphEdge[];
  readonly shape: CompositionShape;
  readonly roots: readonly string[];
  readonly topologicalOrder: readonly string[];
}

export interface CapabilityDependencyEdge {
  readonly capabilityId: string;
  readonly dependsOn: string;
  readonly required: boolean;
  readonly reason: string;
}

export interface CapabilityDependencies {
  readonly edges: readonly CapabilityDependencyEdge[];
  readonly unresolved: readonly string[];
  readonly resolved: readonly string[];
}

export interface CapabilityBundle {
  readonly bundleId: CapabilityBundleId;
  readonly name: string;
  readonly capabilityIds: readonly string[];
  readonly graph: CapabilityGraph;
  readonly reusable: boolean;
  readonly version: string;
  readonly members: readonly CapabilityDefinitionRecord[];
}
