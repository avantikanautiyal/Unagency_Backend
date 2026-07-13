/**
 * Fluent artifact input builder.
 */

import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asUserId,
  asWorkspaceId,
} from "../../shared/identifiers";
import type {
  ArtifactInput,
  ArtifactReference,
  ArtifactRelationship,
  ArtifactType,
} from "../contracts/artifact-models";

export class ArtifactInputBuilder<TPayload = Readonly<Record<string, unknown>>> {
  private type?: ArtifactType;
  private organizationId?: string;
  private workspaceId?: string;
  private userId?: string;
  private capabilityId?: string;
  private executionId?: string;
  private projectId?: string;
  private campaignId?: string;
  private taskId?: string;
  private conversationId?: string;
  private sessionId?: string;
  private correlationId?: string;
  private payload?: TPayload;
  private sourceModule?: string;
  private title?: string;
  private tags?: readonly string[];
  private parents?: readonly ArtifactReference[];
  private derivedFrom?: readonly ArtifactReference[];
  private createdFrom?: readonly ArtifactReference[];
  private relationships?: readonly ArtifactRelationship[];

  static create<TPayload = Readonly<Record<string, unknown>>>(): ArtifactInputBuilder<TPayload> {
    return new ArtifactInputBuilder<TPayload>();
  }

  withType(type: ArtifactType): this {
    this.type = type;
    return this;
  }

  withScope(input: {
    organizationId: string;
    workspaceId: string;
    userId?: string;
    capabilityId?: string;
    executionId?: string;
    projectId?: string;
    campaignId?: string;
    taskId?: string;
    conversationId?: string;
    sessionId?: string;
    correlationId?: string;
  }): this {
    this.organizationId = input.organizationId;
    this.workspaceId = input.workspaceId;
    this.userId = input.userId;
    this.capabilityId = input.capabilityId;
    this.executionId = input.executionId;
    this.projectId = input.projectId;
    this.campaignId = input.campaignId;
    this.taskId = input.taskId;
    this.conversationId = input.conversationId;
    this.sessionId = input.sessionId;
    this.correlationId = input.correlationId;
    return this;
  }

  withPayload(payload: TPayload): this {
    this.payload = payload;
    return this;
  }

  withSourceModule(sourceModule: string): this {
    this.sourceModule = sourceModule;
    return this;
  }

  withTitle(title: string): this {
    this.title = title;
    return this;
  }

  withTags(tags: readonly string[]): this {
    this.tags = tags;
    return this;
  }

  withParents(parents: readonly ArtifactReference[]): this {
    this.parents = parents;
    return this;
  }

  withDerivedFrom(derivedFrom: readonly ArtifactReference[]): this {
    this.derivedFrom = derivedFrom;
    return this;
  }

  withCreatedFrom(createdFrom: readonly ArtifactReference[]): this {
    this.createdFrom = createdFrom;
    return this;
  }

  withRelationships(relationships: readonly ArtifactRelationship[]): this {
    this.relationships = relationships;
    return this;
  }

  build(): ArtifactInput<TPayload> {
    if (!this.type || !this.organizationId || !this.workspaceId || !this.payload || !this.sourceModule) {
      throw new Error("type, scope, payload, and sourceModule are required");
    }
    return {
      type: this.type,
      identity: {
        organizationId: asOrganizationId(this.organizationId),
        workspaceId: asWorkspaceId(this.workspaceId),
        userId: this.userId ? asUserId(this.userId) : undefined,
        capabilityId: this.capabilityId ? asCapabilityId(this.capabilityId) : undefined,
        executionId: this.executionId ? asExecutionId(this.executionId) : undefined,
        projectId: this.projectId,
        campaignId: this.campaignId,
        taskId: this.taskId,
        conversationId: this.conversationId,
        sessionId: this.sessionId,
        correlationId: this.correlationId,
      },
      payload: this.payload,
      sourceModule: this.sourceModule,
      metadata: {
        title: this.title,
        tags: this.tags,
        sourceModule: this.sourceModule,
      },
      parents: this.parents,
      derivedFrom: this.derivedFrom,
      createdFrom: this.createdFrom,
      relationships: this.relationships,
      lifecycle: "created",
    };
  }
}

export function artifactReference(
  artifactId: string,
  type: ArtifactType,
  relationship: ArtifactReference["relationship"],
  versionLabel?: string
): ArtifactReference {
  return { artifactId, type, relationship, versionLabel };
}
