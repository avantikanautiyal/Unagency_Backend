/**
 * Capability composition — single, chain, tree, DAG, pipeline, bundle.
 */

import { success, type Result } from "../../shared/result";
import type { CapabilityDefinitionRecord } from "../contracts/capability";
import type { CapabilityBundle, CapabilityGraph, CapabilityGraphEdge, CapabilityGraphNode } from "../contracts/graph";
import type { CompositionShape } from "../contracts/enums";
import type { ICapabilityComposer } from "../interfaces/capability-intelligence";
import { asCapabilityBundleId, asCapabilityGraphId } from "../contracts/identifiers";

export class DefaultCapabilityComposer implements ICapabilityComposer {
  private createId: (prefix: string) => string;

  constructor(createId: (prefix: string) => string = (p) => `${p}_${Date.now()}`) {
    this.createId = createId;
  }

  compose(
    capabilities: readonly CapabilityDefinitionRecord[],
    preferredShape?: CompositionShape
  ): Result<{
    readonly graph: CapabilityGraph;
    readonly bundle: CapabilityBundle;
    readonly shape: CompositionShape;
  }> {
    const byId = new Map(capabilities.map((c) => [c.capabilityId, c]));
    const nodes: CapabilityGraphNode[] = [];
    const edges: CapabilityGraphEdge[] = [];
    const nodeByCap = new Map<string, string>();

    let stage = 0;
    const order = topologicalCapabilityIds(capabilities);

    for (const id of order) {
      const nodeId = `node_${id}`;
      nodeByCap.set(id, nodeId);
      nodes.push({
        nodeId,
        capabilityId: id,
        stage,
        optional: false,
      });
      stage += 1;
    }

    for (const cap of capabilities) {
      const to = nodeByCap.get(cap.capabilityId);
      if (!to) continue;
      for (const dep of cap.dependencies) {
        const from = nodeByCap.get(dep);
        if (!from) continue;
        edges.push({ fromNodeId: from, toNodeId: to, kind: "depends_on" });
      }
    }

    const shape = preferredShape ?? inferShape(capabilities, edges);
    const roots = nodes
      .filter((n) => !edges.some((e) => e.toNodeId === n.nodeId))
      .map((n) => n.nodeId);

    const graph: CapabilityGraph = {
      graphId: asCapabilityGraphId(this.createId("cap_graph")),
      nodes,
      edges,
      shape,
      roots,
      topologicalOrder: order,
    };

    const bundle: CapabilityBundle = {
      bundleId: asCapabilityBundleId(this.createId("cap_bundle")),
      name: `bundle_${capabilities.length}_capabilities`,
      capabilityIds: order,
      graph,
      reusable: capabilities.length > 1,
      version: "1.0.0",
      members: order.map((id) => byId.get(id)!).filter(Boolean),
    };

    return success({ graph, bundle, shape });
  }
}

function topologicalCapabilityIds(
  capabilities: readonly CapabilityDefinitionRecord[]
): string[] {
  const ids = new Set(capabilities.map((c) => c.capabilityId));
  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();

  for (const id of ids) {
    indegree.set(id, 0);
    children.set(id, []);
  }

  for (const cap of capabilities) {
    for (const dep of cap.dependencies) {
      if (!ids.has(dep) || !ids.has(cap.capabilityId)) continue;
      children.get(dep)!.push(cap.capabilityId);
      indegree.set(cap.capabilityId, (indegree.get(cap.capabilityId) ?? 0) + 1);
    }
  }

  const queue = [...ids].filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const child of children.get(id) ?? []) {
      const next = (indegree.get(child) ?? 1) - 1;
      indegree.set(child, next);
      if (next === 0) queue.push(child);
    }
  }

  // Cycle fallback — append remaining.
  for (const id of ids) {
    if (!order.includes(id)) order.push(id);
  }
  return order;
}

function inferShape(
  capabilities: readonly CapabilityDefinitionRecord[],
  edges: readonly CapabilityGraphEdge[]
): CompositionShape {
  if (capabilities.length <= 1) return "single";
  if (edges.length === 0) return "bundle";

  const fanOut = new Map<string, number>();
  const fanIn = new Map<string, number>();
  for (const e of edges) {
    fanOut.set(e.fromNodeId, (fanOut.get(e.fromNodeId) ?? 0) + 1);
    fanIn.set(e.toNodeId, (fanIn.get(e.toNodeId) ?? 0) + 1);
  }

  const maxOut = Math.max(0, ...fanOut.values());
  const maxIn = Math.max(0, ...fanIn.values());

  if (maxOut <= 1 && maxIn <= 1) return "chain";
  if (maxOut > 1 && maxIn <= 1) return "tree";
  if (maxIn > 1) return "dag";
  return "pipeline";
}
