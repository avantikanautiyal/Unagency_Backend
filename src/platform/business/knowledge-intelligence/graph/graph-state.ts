/**
 * In-memory versioned knowledge graph for one organization tip + history.
 */

import type {
  KnowledgeEntity,
  KnowledgeGraphDiff,
  KnowledgeGraphSnapshot,
  KnowledgeRelationship,
} from "../contracts";

export interface OrgGraphState {
  entities: Map<string, KnowledgeEntity>;
  relationships: Map<string, KnowledgeRelationship>;
  snapshots: KnowledgeGraphSnapshot[];
  brandBrainVersion?: number;
}

export function emptyOrgGraph(): OrgGraphState {
  return {
    entities: new Map(),
    relationships: new Map(),
    snapshots: [],
  };
}

export function replaceGraph(
  state: OrgGraphState,
  entities: readonly KnowledgeEntity[],
  relationships: readonly KnowledgeRelationship[],
  brandBrainVersion: number | undefined,
  meta: {
    snapshotId: string;
    organizationId: string;
    createdAt: string;
    changelog: string;
  }
): KnowledgeGraphSnapshot {
  state.entities = new Map(entities.map((e) => [e.entityId, e]));
  state.relationships = new Map(relationships.map((r) => [r.relationshipId, r]));
  state.brandBrainVersion = brandBrainVersion;
  const version = state.snapshots.length
    ? state.snapshots[state.snapshots.length - 1]!.version + 1
    : 1;
  const snapshot: KnowledgeGraphSnapshot = {
    snapshotId: meta.snapshotId,
    organizationId: meta.organizationId,
    version,
    brandBrainVersion,
    entities: [...entities],
    relationships: [...relationships],
    createdAt: meta.createdAt,
    changelog: meta.changelog,
  };
  state.snapshots = [...state.snapshots, snapshot];
  return snapshot;
}

export function commitGraphMutation(
  state: OrgGraphState,
  meta: {
    snapshotId: string;
    organizationId: string;
    createdAt: string;
    changelog: string;
  }
): KnowledgeGraphSnapshot {
  return replaceGraph(
    state,
    [...state.entities.values()],
    [...state.relationships.values()],
    state.brandBrainVersion,
    meta
  );
}

export function diffSnapshots(
  from: KnowledgeGraphSnapshot,
  to: KnowledgeGraphSnapshot
): KnowledgeGraphDiff {
  const fromE = new Set(from.entities.map((e) => e.entityId));
  const toE = new Set(to.entities.map((e) => e.entityId));
  const fromR = new Map(from.relationships.map((r) => [r.relationshipId, r]));
  const toR = new Map(to.relationships.map((r) => [r.relationshipId, r]));

  const entitiesAdded = [...toE].filter((id) => !fromE.has(id));
  const entitiesRemoved = [...fromE].filter((id) => !toE.has(id));
  const relationshipsAdded = [...toR.keys()].filter((id) => !fromR.has(id));
  const relationshipsRemoved = [...fromR.keys()].filter((id) => !toR.has(id));
  const relationshipsUpdated = [...toR.keys()].filter((id) => {
    const a = fromR.get(id);
    const b = toR.get(id);
    return a && b && a.version !== b.version;
  });

  return {
    fromVersion: from.version,
    toVersion: to.version,
    entitiesAdded,
    entitiesRemoved,
    relationshipsAdded,
    relationshipsRemoved,
    relationshipsUpdated,
  };
}
