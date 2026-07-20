/**
 * Graph traversal — related entities, shortest path, neighborhood.
 * Deterministic BFS/Dijkstra-style; no LLM reasoning.
 */

import type {
  KnowledgeEntity,
  KnowledgePath,
  KnowledgePathHop,
  KnowledgeRelationship,
} from "../contracts";

export function buildAdjacency(
  relationships: readonly KnowledgeRelationship[]
): Map<string, KnowledgeRelationship[]> {
  const adj = new Map<string, KnowledgeRelationship[]>();
  for (const r of relationships) {
    const a = adj.get(r.fromEntityId) ?? [];
    a.push(r);
    adj.set(r.fromEntityId, a);
    const b = adj.get(r.toEntityId) ?? [];
    b.push(r);
    adj.set(r.toEntityId, b);
  }
  return adj;
}

export function relatedVia(
  entityId: string,
  relationships: readonly KnowledgeRelationship[],
  options: { maxDepth?: number; relationshipTypes?: readonly string[] } = {}
): { entityIds: Set<string>; used: KnowledgeRelationship[] } {
  const maxDepth = options.maxDepth ?? 2;
  const typeFilter = options.relationshipTypes
    ? new Set(options.relationshipTypes)
    : undefined;
  const adj = buildAdjacency(
    typeFilter
      ? relationships.filter((r) => typeFilter.has(r.type))
      : relationships
  );
  const visited = new Set<string>([entityId]);
  const used: KnowledgeRelationship[] = [];
  let frontier = [entityId];
  for (let d = 0; d < maxDepth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const r of adj.get(id) ?? []) {
        const other = r.fromEntityId === id ? r.toEntityId : r.fromEntityId;
        if (!visited.has(other)) {
          visited.add(other);
          next.push(other);
          used.push(r);
        }
      }
    }
    frontier = next;
  }
  visited.delete(entityId);
  return { entityIds: visited, used };
}

export function shortestPath(
  fromEntityId: string,
  toEntityId: string,
  relationships: readonly KnowledgeRelationship[]
): KnowledgePath | undefined {
  if (fromEntityId === toEntityId) {
    return { hops: [], totalWeight: 0, length: 0 };
  }
  const adj = buildAdjacency(relationships);
  type Node = { id: string; hops: KnowledgePathHop[]; cost: number };
  const queue: Node[] = [{ id: fromEntityId, hops: [], cost: 0 }];
  const best = new Map<string, number>([[fromEntityId, 0]]);

  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift()!;
    if (cur.id === toEntityId) {
      return {
        hops: cur.hops,
        totalWeight: cur.hops.reduce((s, h) => s + h.weight, 0),
        length: cur.hops.length,
      };
    }
    for (const r of adj.get(cur.id) ?? []) {
      const other = r.fromEntityId === cur.id ? r.toEntityId : r.fromEntityId;
      const hop: KnowledgePathHop = {
        fromEntityId: cur.id,
        toEntityId: other,
        relationshipId: r.relationshipId,
        relationshipType: r.type,
        weight: r.weight,
      };
      // Prefer higher-weight edges as lower path cost.
      const stepCost = 1 / Math.max(r.weight, 0.01);
      const nextCost = cur.cost + stepCost;
      if ((best.get(other) ?? Number.POSITIVE_INFINITY) <= nextCost) continue;
      best.set(other, nextCost);
      queue.push({ id: other, hops: [...cur.hops, hop], cost: nextCost });
    }
  }
  return undefined;
}

export function neighborhood(
  entityId: string,
  entities: Map<string, KnowledgeEntity>,
  relationships: readonly KnowledgeRelationship[],
  depth = 1
): {
  entities: KnowledgeEntity[];
  relationships: KnowledgeRelationship[];
} {
  const { entityIds, used } = relatedVia(entityId, relationships, { maxDepth: depth });
  const seed = entities.get(entityId);
  const outEntities: KnowledgeEntity[] = seed ? [seed] : [];
  for (const id of entityIds) {
    const e = entities.get(id);
    if (e) outEntities.push(e);
  }
  return { entities: outEntities, relationships: used };
}
