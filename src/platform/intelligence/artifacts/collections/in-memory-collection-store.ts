/**
 * In-memory artifact collection store — no database.
 */

import { randomUUID } from "crypto";
import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { ArtifactCollection, ArtifactSnapshot } from "../contracts/artifact-models";
import { ArtifactNotFoundError } from "../errors";
import type {
  ArtifactCollectionGroupKey,
  ArtifactCollectionPredicate,
  ArtifactCollectionQuery,
  IArtifactCollectionStore,
} from "../interfaces/artifact-ports";

export class InMemoryArtifactCollectionStore implements IArtifactCollectionStore {
  private readonly collections = new Map<string, ArtifactCollection>();

  create(name: string): ArtifactCollection {
    const collection: ArtifactCollection = {
      collectionId: `acol_${randomUUID()}`,
      name,
      artifacts: [],
      createdAt: new Date().toISOString(),
    };
    this.collections.set(collection.collectionId, collection);
    return collection;
  }

  add(collectionId: string, snapshot: ArtifactSnapshot): Result<ArtifactCollection> {
    const collection = this.collections.get(collectionId);
    if (!collection) {
      return failure(new ArtifactNotFoundError(`Collection not found: ${collectionId}`));
    }
    const updated: ArtifactCollection = {
      ...collection,
      artifacts: [...collection.artifacts, snapshot],
    };
    this.collections.set(collectionId, updated);
    return success(updated);
  }

  search(
    collectionId: string,
    query: ArtifactCollectionQuery
  ): Result<readonly ArtifactSnapshot[]> {
    const collection = this.collections.get(collectionId);
    if (!collection) {
      return failure(new ArtifactNotFoundError(`Collection not found: ${collectionId}`));
    }
    const results = collection.artifacts.filter((snap) => matchesQuery(snap, query));
    return success(results);
  }

  filter(
    collectionId: string,
    predicate: ArtifactCollectionPredicate
  ): Result<readonly ArtifactSnapshot[]> {
    const collection = this.collections.get(collectionId);
    if (!collection) {
      return failure(new ArtifactNotFoundError(`Collection not found: ${collectionId}`));
    }
    return success(collection.artifacts.filter(predicate));
  }

  groupBy(
    collectionId: string,
    key: ArtifactCollectionGroupKey
  ): Result<Readonly<Record<string, readonly ArtifactSnapshot[]>>> {
    const collection = this.collections.get(collectionId);
    if (!collection) {
      return failure(new ArtifactNotFoundError(`Collection not found: ${collectionId}`));
    }
    const groups: Record<string, ArtifactSnapshot[]> = {};
    for (const snap of collection.artifacts) {
      const groupKey = resolveGroupKey(snap, key);
      groups[groupKey] = groups[groupKey] ?? [];
      groups[groupKey].push(snap);
    }
    return success(groups);
  }

  iterate(collectionId: string): Result<readonly ArtifactSnapshot[]> {
    const collection = this.collections.get(collectionId);
    if (!collection) {
      return failure(new ArtifactNotFoundError(`Collection not found: ${collectionId}`));
    }
    return success([...collection.artifacts]);
  }
}

function matchesQuery(snapshot: ArtifactSnapshot, query: ArtifactCollectionQuery): boolean {
  const artifact = snapshot.artifact;
  if (query.type && artifact.type !== query.type) return false;
  if (query.lifecycle && artifact.lifecycle !== query.lifecycle) return false;
  if (
    query.organizationId &&
    String(artifact.identity.organizationId) !== query.organizationId
  ) {
    return false;
  }
  if (query.workspaceId && String(artifact.identity.workspaceId) !== query.workspaceId) {
    return false;
  }
  if (query.sourceModule && artifact.metadata.sourceModule !== query.sourceModule) {
    return false;
  }
  if (query.tag && !artifact.metadata.tags?.includes(query.tag)) return false;
  return true;
}

function resolveGroupKey(snapshot: ArtifactSnapshot, key: ArtifactCollectionGroupKey): string {
  const artifact = snapshot.artifact;
  switch (key) {
    case "type":
      return artifact.type;
    case "lifecycle":
      return artifact.lifecycle;
    case "organizationId":
      return String(artifact.identity.organizationId);
    case "workspaceId":
      return String(artifact.identity.workspaceId);
    case "sourceModule":
      return artifact.metadata.sourceModule ?? "unknown";
  }
}
