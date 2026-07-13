/**
 * Memory record and snapshot builders.
 */

import { createHash, randomUUID } from "crypto";
import type { IntelligenceContext } from "../../context/contracts/intelligence-context";
import type { KnowledgeSnapshot } from "../../knowledge/contracts/knowledge-models";
import type { CompiledPrompt } from "../../prompt-compiler/contracts/prompt-models";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asUserId,
  asWorkspaceId,
} from "../../shared/identifiers";
import type {
  MemoryArtifact,
  MemoryClassification,
  MemoryIdentity,
  MemoryRecord,
  MemoryRequest,
  MemoryRetentionPolicy,
  MemoryScope,
  MemorySnapshot,
  MemoryWriteInput,
} from "../contracts/memory-models";
import { MemoryValidationError } from "../errors";

export class MemoryRecordBuilder {
  private identity?: MemoryIdentity;
  private scope?: MemoryScope;
  private classification?: MemoryClassification;
  private content?: Readonly<Record<string, unknown>>;
  private retention?: MemoryRetentionPolicy;
  private importance?: number;
  private title?: string;
  private tags?: readonly string[];
  private sourceModule?: string;

  static create(): MemoryRecordBuilder {
    return new MemoryRecordBuilder();
  }

  withIdentity(identity: MemoryIdentity): this {
    this.identity = identity;
    return this;
  }

  withScope(scope: MemoryScope): this {
    this.scope = scope;
    return this;
  }

  withClassification(classification: MemoryClassification): this {
    this.classification = classification;
    return this;
  }

  withContent(content: Readonly<Record<string, unknown>>): this {
    this.content = content;
    return this;
  }

  withRetention(retention?: MemoryRetentionPolicy): this {
    this.retention = retention;
    return this;
  }

  withImportance(importance?: number): this {
    this.importance = importance;
    return this;
  }

  withMetadata(input: {
    title?: string;
    tags?: readonly string[];
    sourceModule?: string;
  }): this {
    this.title = input.title;
    this.tags = input.tags;
    this.sourceModule = input.sourceModule;
    return this;
  }

  build(nowIso: () => string = () => new Date().toISOString()): MemoryRecord {
    if (!this.identity || !this.scope || !this.classification || !this.content) {
      throw new MemoryValidationError(
        "identity, scope, classification, and content are required"
      );
    }
    const now = nowIso();
    return {
      id: `mem_${randomUUID()}`,
      identity: this.identity,
      scope: this.scope,
      classification: this.classification,
      lifecycleState: "active",
      retention: this.retention ?? { retentionClass: "working" },
      content: this.content,
      importance: this.importance,
      metadata: {
        title: this.title,
        tags: this.tags,
        sourceModule: this.sourceModule,
        createdAt: now,
        updatedAt: now,
      },
    };
  }
}

export class MemorySnapshotBuilder {
  private identity?: MemoryIdentity;
  private records: readonly MemoryRecord[] = [];

  static create(): MemorySnapshotBuilder {
    return new MemorySnapshotBuilder();
  }

  withIdentity(identity: MemoryIdentity): this {
    this.identity = identity;
    return this;
  }

  withRecords(records: readonly MemoryRecord[]): this {
    this.records = records;
    return this;
  }

  build(nowIso: () => string = () => new Date().toISOString()): MemorySnapshot {
    if (!this.identity) {
      throw new MemoryValidationError("identity is required");
    }
    const capturedAt = nowIso();
    const snapshotId = `msnap_${randomUUID()}`;
    const scopes = uniqueScopes(this.records);
    const checksum = createHash("sha256")
      .update(
        JSON.stringify({
          snapshotId,
          org: this.identity.organizationId,
          records: this.records.map((r) => r.id),
          capturedAt,
        })
      )
      .digest("hex")
      .slice(0, 16);

    return {
      snapshotId,
      identity: this.identity,
      records: this.records,
      scopes,
      capturedAt,
      checksum,
    };
  }
}

export class MemoryRequestBuilder {
  private identity?: MemoryIdentity;
  private scope?: MemoryScope;
  private classifications?: readonly MemoryClassification[];
  private from?: string;
  private to?: string;
  private limit?: number;

  static create(): MemoryRequestBuilder {
    return new MemoryRequestBuilder();
  }

  static fromIntelligenceContext(
    context: IntelligenceContext
  ): MemoryRequestBuilder {
    return MemoryRequestBuilder.create().withIdentity({
      organizationId: context.identity.organizationId,
      workspaceId: context.identity.workspaceId,
      userId: context.identity.userId,
      capabilityId: context.scope.capabilityId,
      projectId: context.scope.projectId,
      correlationId: context.identity.correlationId,
    });
  }

  withIdentity(identity: MemoryIdentity): this {
    this.identity = identity;
    return this;
  }

  withScope(scope?: MemoryScope): this {
    this.scope = scope;
    return this;
  }

  withClassifications(...classifications: MemoryClassification[]): this {
    this.classifications = classifications;
    return this;
  }

  withTimeframe(from?: string, to?: string): this {
    this.from = from;
    this.to = to;
    return this;
  }

  withLimit(limit?: number): this {
    this.limit = limit;
    return this;
  }

  build(): MemoryRequest {
    if (!this.identity) {
      throw new MemoryValidationError("identity is required");
    }
    return {
      identity: this.identity,
      scope: this.scope,
      classifications: this.classifications,
      from: this.from,
      to: this.to,
      limit: this.limit ?? 50,
      includeDeleted: false,
    };
  }
}

export function memoryIdentityFromIds(input: {
  organizationId: string;
  workspaceId: string;
  userId?: string;
  capabilityId?: string;
  executionId?: string;
  sessionId?: string;
}): MemoryIdentity {
  return {
    organizationId: asOrganizationId(input.organizationId),
    workspaceId: asWorkspaceId(input.workspaceId),
    userId: input.userId ? asUserId(input.userId) : undefined,
    capabilityId: input.capabilityId
      ? asCapabilityId(input.capabilityId)
      : undefined,
    executionId: input.executionId
      ? asExecutionId(input.executionId)
      : undefined,
    sessionId: input.sessionId,
  };
}

export function artifactsFromExecution(input: {
  prompt?: CompiledPrompt;
  knowledge?: KnowledgeSnapshot;
  response?: Readonly<Record<string, unknown>>;
  execution?: Readonly<Record<string, unknown>>;
}): MemoryArtifact[] {
  const artifacts: MemoryArtifact[] = [];
  if (input.prompt) {
    artifacts.push({
      classification: "prompt",
      content: {
        compilationId: input.prompt.compilationId,
        templateId: input.prompt.templateId,
        messages: input.prompt.messages,
      },
      sourceModule: "prompt-compiler",
      tags: ["prompt"],
    });
  }
  if (input.knowledge) {
    artifacts.push({
      classification: "knowledge",
      content: {
        snapshotId: input.knowledge.snapshotId,
        documentIds: input.knowledge.documents.map((d) => d.id),
      },
      sourceModule: "knowledge",
      tags: ["knowledge"],
    });
  }
  if (input.execution) {
    artifacts.push({
      classification: "execution",
      content: input.execution,
      sourceModule: "execution-runtime",
      tags: ["execution"],
    });
  }
  if (input.response) {
    artifacts.push({
      classification: "response",
      content: input.response,
      sourceModule: "gateway",
      tags: ["response"],
    });
  }
  return artifacts;
}

function uniqueScopes(records: readonly MemoryRecord[]): MemoryScope[] {
  const map = new Map<string, MemoryScope>();
  for (const record of records) {
    map.set(`${record.scope.kind}:${record.scope.scopeId}`, record.scope);
  }
  return [...map.values()];
}

export type { MemoryWriteInput };
