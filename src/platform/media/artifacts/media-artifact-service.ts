/**
 * Media artifact finalization — idempotent durable artifact + blob linkage.
 */

import type { ExecutionArtifactRef } from "../../api/contracts";
import type { IArtifactRepository } from "../../infrastructure/durability/interfaces/execution-store-ports";
import type { DurableBlobRef } from "../contracts/durable-blob-ref";

export interface MediaArtifactRecord {
  readonly artifactId: string;
  readonly executionId: string;
  readonly organizationId: string;
  readonly operationId: string;
  readonly outputIndex: number;
  readonly blob: DurableBlobRef;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
}

export class MediaArtifactService {
  private readonly finalized = new Map<string, MediaArtifactRecord>();

  constructor(private readonly artifacts: IArtifactRepository) {}

  buildArtifactId(operationId: string, outputIndex: number): string {
    return `art_${operationId}_${outputIndex}`;
  }

  isFinalized(operationId: string, outputIndex: number): boolean {
    return this.finalized.has(`${operationId}:${outputIndex}`);
  }

  /** Durable check — survives process restart and multi-instance races. */
  async isFinalizedDurable(
    operationId: string,
    outputIndex: number,
    executionId: string
  ): Promise<boolean> {
    const key = `${operationId}:${outputIndex}`;
    if (this.finalized.has(key)) return true;
    const artifactId = this.buildArtifactId(operationId, outputIndex);
    const existing = await this.artifacts.get(artifactId);
    if (existing && existing.executionId === executionId) {
      return true;
    }
    const listed = await this.artifacts.list(executionId);
    return listed.some((a) => a.artifactId === artifactId);
  }

  async finalize(input: {
    operationId: string;
    executionId: string;
    organizationId: string;
    outputIndex: number;
    blob: DurableBlobRef;
    providerId: string;
    modelId: string;
    capabilityId: string;
  }): Promise<MediaArtifactRecord> {
    const key = `${input.operationId}:${input.outputIndex}`;
    const existingLocal = this.finalized.get(key);
    if (existingLocal) return existingLocal;

    const artifactId = this.buildArtifactId(input.operationId, input.outputIndex);
    const durableExisting = await this.artifacts.get(artifactId);
    if (durableExisting && durableExisting.executionId === input.executionId) {
      const record: MediaArtifactRecord = {
        artifactId,
        executionId: input.executionId,
        organizationId: input.organizationId,
        operationId: input.operationId,
        outputIndex: input.outputIndex,
        blob: input.blob,
        providerId: input.providerId,
        modelId: input.modelId,
        capabilityId: input.capabilityId,
      };
      this.finalized.set(key, record);
      return record;
    }
    const record: MediaArtifactRecord = {
      artifactId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      operationId: input.operationId,
      outputIndex: input.outputIndex,
      blob: input.blob,
      providerId: input.providerId,
      modelId: input.modelId,
      capabilityId: input.capabilityId,
    };

    const ref: ExecutionArtifactRef = {
      artifactId,
      kind: "media",
      label: `blob:${input.blob.storageKey}`,
    };

    const existingArtifacts = await this.artifacts.list(input.executionId);
    const merged = [
      ...existingArtifacts.filter((a: ExecutionArtifactRef) => a.artifactId !== artifactId),
      ref,
    ];
    await this.artifacts.save(input.executionId, input.organizationId, merged);

    this.finalized.set(key, record);
    return record;
  }

  listFinalized(operationId: string): readonly MediaArtifactRecord[] {
    return [...this.finalized.values()].filter((r) => r.operationId === operationId);
  }

  clear(): void {
    this.finalized.clear();
  }
}
