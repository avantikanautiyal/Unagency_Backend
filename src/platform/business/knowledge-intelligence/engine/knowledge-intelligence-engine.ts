/**
 * Knowledge Intelligence Engine — semantic graph over Brand Brain.
 * No prompts. No AI execution. No LLM reasoning.
 */

import { failure, success, type Result } from "../../../intelligence/shared/result";
import { NotFoundError, ValidationError } from "../../../intelligence/shared/errors";
import type {
  KnowledgeContextPackage,
  KnowledgeEntity,
  KnowledgeGraphDiff,
  KnowledgeGraphSnapshot,
  KnowledgePath,
  KnowledgeRelationship,
  KnowledgeRetrievalQuery,
} from "../contracts";
import type {
  IKnowledgeIntelligenceEngine,
  SyncFromBrandBrainInput,
  TraversalOptions,
  UpsertEntityInput,
  UpsertRelationshipInput,
} from "../interfaces";
import { projectBrandBrainToGraph } from "../graph/brand-brain-projector";
import {
  commitGraphMutation,
  diffSnapshots,
  emptyOrgGraph,
  replaceGraph,
  type OrgGraphState,
} from "../graph/graph-state";
import {
  neighborhood as walkNeighborhood,
  relatedVia,
  shortestPath as findShortestPath,
} from "../reasoning/traverse";
import {
  assembleKnowledgeContext,
  contextToExecutionMetadata,
} from "../context/assemble-context";
import { defaultWeightFor } from "../ontology";

export interface KnowledgeIntelligenceEngineDeps {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class KnowledgeIntelligenceEngine implements IKnowledgeIntelligenceEngine {
  private readonly nowIso: () => string;
  private readonly createId: (prefix: string) => string;
  private readonly graphs = new Map<string, OrgGraphState>();

  constructor(deps: KnowledgeIntelligenceEngineDeps = {}) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    const clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${clockMs()}`);
  }

  syncFromBrandBrain(input: SyncFromBrandBrainInput): Result<KnowledgeGraphSnapshot> {
    if (!input.organizationId?.trim()) {
      return failure(new ValidationError("organizationId required"));
    }
    if (input.document.organizationId !== input.organizationId) {
      return failure(new ValidationError("document.organizationId mismatch"));
    }
    if (input.brandBrainVersion < 1) {
      return failure(new ValidationError("brandBrainVersion must be >= 1"));
    }

    const state = this.ensure(input.organizationId);
    const projected = projectBrandBrainToGraph(input.document, {
      nowIso: this.nowIso,
      createId: this.createId,
      relationshipVersion: 1,
    });
    const snapshot = replaceGraph(
      state,
      projected.entities,
      projected.relationships,
      input.brandBrainVersion,
      {
        snapshotId: this.createId("ksnap"),
        organizationId: input.organizationId,
        createdAt: this.nowIso(),
        changelog:
          input.changelog ??
          `sync from brand brain v${input.brandBrainVersion}`,
      }
    );
    return success(snapshot);
  }

  upsertEntity(input: UpsertEntityInput): Result<KnowledgeEntity> {
    if (!input.changelog?.trim()) {
      return failure(new ValidationError("changelog required"));
    }
    if (input.entity.organizationId !== input.organizationId) {
      return failure(new ValidationError("entity.organizationId mismatch"));
    }
    const state = this.ensure(input.organizationId);
    const now = this.nowIso();
    const existing = state.entities.get(input.entity.entityId);
    const entity: KnowledgeEntity = {
      ...input.entity,
      createdAt: existing?.createdAt ?? input.entity.createdAt ?? now,
      updatedAt: now,
    };
    state.entities.set(entity.entityId, entity);
    commitGraphMutation(state, {
      snapshotId: this.createId("ksnap"),
      organizationId: input.organizationId,
      createdAt: now,
      changelog: input.changelog,
    });
    return success(entity);
  }

  upsertRelationship(input: UpsertRelationshipInput): Result<KnowledgeRelationship> {
    if (!input.changelog?.trim()) {
      return failure(new ValidationError("changelog required"));
    }
    if (input.relationship.organizationId !== input.organizationId) {
      return failure(new ValidationError("relationship.organizationId mismatch"));
    }
    const state = this.ensure(input.organizationId);
    if (
      !state.entities.has(input.relationship.fromEntityId) ||
      !state.entities.has(input.relationship.toEntityId)
    ) {
      return failure(new ValidationError("relationship endpoints must exist"));
    }
    const existing = state.relationships.get(input.relationship.relationshipId);
    const nextVersion = existing ? existing.version + 1 : 1;
    const rel: KnowledgeRelationship = {
      ...input.relationship,
      weight: input.relationship.weight || defaultWeightFor(input.relationship.type),
      version: nextVersion,
      createdAt: input.relationship.createdAt ?? this.nowIso(),
      changelog: input.changelog,
    };
    state.relationships.set(rel.relationshipId, rel);
    commitGraphMutation(state, {
      snapshotId: this.createId("ksnap"),
      organizationId: input.organizationId,
      createdAt: this.nowIso(),
      changelog: input.changelog,
    });
    return success(rel);
  }

  getEntity(
    organizationId: string,
    entityId: string
  ): Result<KnowledgeEntity | undefined> {
    return success(this.graphs.get(organizationId)?.entities.get(entityId));
  }

  listEntities(
    organizationId: string,
    type?: string
  ): Result<readonly KnowledgeEntity[]> {
    const all = [...(this.graphs.get(organizationId)?.entities.values() ?? [])];
    return success(type ? all.filter((e) => e.type === type) : all);
  }

  listRelationships(
    organizationId: string
  ): Result<readonly KnowledgeRelationship[]> {
    return success([
      ...(this.graphs.get(organizationId)?.relationships.values() ?? []),
    ]);
  }

  getCurrentSnapshot(
    organizationId: string
  ): Result<KnowledgeGraphSnapshot | undefined> {
    const snaps = this.graphs.get(organizationId)?.snapshots ?? [];
    return success(snaps.length ? snaps[snaps.length - 1] : undefined);
  }

  getSnapshot(
    organizationId: string,
    version: number
  ): Result<KnowledgeGraphSnapshot | undefined> {
    const snaps = this.graphs.get(organizationId)?.snapshots ?? [];
    return success(snaps.find((s) => s.version === version));
  }

  listSnapshots(
    organizationId: string
  ): Result<readonly KnowledgeGraphSnapshot[]> {
    return success(this.graphs.get(organizationId)?.snapshots ?? []);
  }

  compare(
    organizationId: string,
    fromVersion: number,
    toVersion: number
  ): Result<KnowledgeGraphDiff> {
    const snaps = this.graphs.get(organizationId)?.snapshots ?? [];
    const from = snaps.find((s) => s.version === fromVersion);
    const to = snaps.find((s) => s.version === toVersion);
    if (!from || !to) {
      return failure(new NotFoundError("snapshot version not found"));
    }
    return success(diffSnapshots(from, to));
  }

  relatedEntities(
    organizationId: string,
    entityId: string,
    options?: TraversalOptions
  ): Result<readonly KnowledgeEntity[]> {
    const state = this.graphs.get(organizationId);
    if (!state?.entities.has(entityId)) {
      return failure(new NotFoundError("entity not found"));
    }
    const { entityIds } = relatedVia(entityId, [...state.relationships.values()], {
      maxDepth: options?.maxDepth ?? 2,
      relationshipTypes: options?.relationshipTypes,
    });
    return success(
      [...entityIds]
        .map((id) => state.entities.get(id)!)
        .filter(Boolean)
    );
  }

  shortestPath(
    organizationId: string,
    fromEntityId: string,
    toEntityId: string
  ): Result<KnowledgePath | undefined> {
    const state = this.graphs.get(organizationId);
    if (!state) return failure(new NotFoundError("graph not found"));
    return success(
      findShortestPath(fromEntityId, toEntityId, [...state.relationships.values()])
    );
  }

  neighborhood(
    organizationId: string,
    entityId: string,
    depth = 1
  ): Result<{
    readonly entities: readonly KnowledgeEntity[];
    readonly relationships: readonly KnowledgeRelationship[];
  }> {
    const state = this.graphs.get(organizationId);
    if (!state?.entities.has(entityId)) {
      return failure(new NotFoundError("entity not found"));
    }
    return success(
      walkNeighborhood(
        entityId,
        state.entities,
        [...state.relationships.values()],
        depth
      )
    );
  }

  assembleContext(query: KnowledgeRetrievalQuery): Result<KnowledgeContextPackage> {
    if (!query.organizationId?.trim()) {
      return failure(new ValidationError("organizationId required"));
    }
    const state = this.graphs.get(query.organizationId);
    const tip = state?.snapshots[state.snapshots.length - 1];
    if (!state || !tip) {
      return failure(new NotFoundError("knowledge graph not found for organization"));
    }
    return success(
      assembleKnowledgeContext({
        query,
        entities: state.entities,
        relationships: [...state.relationships.values()],
        graphVersion: tip.version,
        snapshotId: tip.snapshotId,
        brandBrainVersion: tip.brandBrainVersion,
        nowIso: this.nowIso,
        createId: this.createId,
      })
    );
  }

  toExecutionMetadata(
    pack: KnowledgeContextPackage
  ): Readonly<Record<string, unknown>> {
    return contextToExecutionMetadata(pack);
  }

  private ensure(organizationId: string): OrgGraphState {
    let state = this.graphs.get(organizationId);
    if (!state) {
      state = emptyOrgGraph();
      this.graphs.set(organizationId, state);
    }
    return state;
  }
}
