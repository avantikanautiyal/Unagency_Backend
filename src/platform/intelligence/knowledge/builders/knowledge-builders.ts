/**
 * Knowledge request and snapshot builders.
 */

import { createHash, randomUUID } from "crypto";
import {
  asCapabilityId,
  asOrganizationId,
  asUserId,
  asWorkspaceId,
} from "../../shared/identifiers";
import type { IntelligenceContext } from "../../context/contracts/intelligence-context";
import type {
  KnowledgeDocument,
  KnowledgeFilter,
  KnowledgeIdentity,
  KnowledgePermission,
  KnowledgeRanking,
  KnowledgeRequest,
  KnowledgeSnapshot,
  KnowledgeSource,
  KnowledgeSourceKind,
} from "../contracts/knowledge-models";
import { KnowledgeValidationError } from "../errors";

export class KnowledgeRequestBuilder {
  private identity?: KnowledgeIdentity;
  private query?: string;
  private filter?: KnowledgeFilter;
  private ranking?: KnowledgeRanking;
  private permission?: KnowledgePermission;
  private sourceKinds?: readonly KnowledgeSourceKind[];
  private contextHints?: Readonly<Record<string, unknown>>;
  private attributes?: Readonly<Record<string, unknown>>;

  static create(): KnowledgeRequestBuilder {
    return new KnowledgeRequestBuilder();
  }

  static fromIntelligenceContext(
    context: IntelligenceContext,
    query?: string
  ): KnowledgeRequestBuilder {
    return KnowledgeRequestBuilder.create()
      .withIdentity({
        organizationId: context.identity.organizationId,
        workspaceId: context.identity.workspaceId,
        userId: context.identity.userId,
        capabilityId: context.scope.capabilityId,
        projectId: context.scope.projectId,
        correlationId: context.identity.correlationId,
      })
      .withPermission({
        organizationId: context.identity.organizationId,
        workspaceId: context.identity.workspaceId,
        projectId: context.scope.projectId,
        roles: context.role.roles,
        permissions: context.role.permissions,
        capabilityId: context.scope.capabilityId,
        classification: context.security.classification,
      })
      .withQuery(query)
      .withContextHints({
        brandId: context.brand.brandId,
        language: context.language.language,
        locale: context.locale.locale,
      });
  }

  withIdentity(identity: KnowledgeIdentity): this {
    this.identity = identity;
    return this;
  }

  withQuery(query?: string): this {
    this.query = query;
    return this;
  }

  withFilter(filter?: KnowledgeFilter): this {
    this.filter = filter;
    return this;
  }

  withRanking(ranking?: KnowledgeRanking): this {
    this.ranking = ranking;
    return this;
  }

  withPermission(permission: KnowledgePermission): this {
    this.permission = permission;
    return this;
  }

  withSourceKinds(...kinds: KnowledgeSourceKind[]): this {
    this.sourceKinds = kinds;
    return this;
  }

  withContextHints(hints?: Readonly<Record<string, unknown>>): this {
    this.contextHints = hints;
    return this;
  }

  withAttributes(attributes?: Readonly<Record<string, unknown>>): this {
    this.attributes = attributes;
    return this;
  }

  build(): KnowledgeRequest {
    if (!this.identity || !this.permission) {
      throw new KnowledgeValidationError(
        "identity and permission are required"
      );
    }
    return {
      identity: this.identity,
      query: this.query,
      filter: this.filter ?? {
        excludeDeprecated: true,
        excludeExpired: true,
        maxDocuments: 10,
      },
      ranking: this.ranking ?? { strategy: "hybrid" },
      permission: this.permission,
      sourceKinds: this.sourceKinds,
      contextHints: this.contextHints,
      attributes: this.attributes,
    };
  }
}

export class KnowledgeSnapshotBuilder {
  private identity?: KnowledgeIdentity;
  private documents: readonly KnowledgeDocument[] = [];
  private sources: readonly KnowledgeSource[] = [];
  private requestId?: string;

  static create(): KnowledgeSnapshotBuilder {
    return new KnowledgeSnapshotBuilder();
  }

  withIdentity(identity: KnowledgeIdentity): this {
    this.identity = identity;
    return this;
  }

  withDocuments(documents: readonly KnowledgeDocument[]): this {
    this.documents = documents;
    return this;
  }

  withSources(sources: readonly KnowledgeSource[]): this {
    this.sources = sources;
    return this;
  }

  withRequestId(requestId?: string): this {
    this.requestId = requestId;
    return this;
  }

  build(nowIso: () => string = () => new Date().toISOString()): KnowledgeSnapshot {
    if (!this.identity) {
      throw new KnowledgeValidationError("identity is required");
    }

    const chunks = this.documents.flatMap((doc) => doc.chunks);
    const references = this.documents.flatMap(
      (doc) => doc.references ?? [{ documentId: doc.id, sourceId: doc.sourceId, title: doc.metadata.title }]
    );
    const capturedAt = nowIso();
    const snapshotId = `ksnap_${randomUUID()}`;
    const checksum = createHash("sha256")
      .update(
        JSON.stringify({
          snapshotId,
          org: this.identity.organizationId,
          docs: this.documents.map((d) => d.id),
          capturedAt,
        })
      )
      .digest("hex")
      .slice(0, 16);

    return {
      snapshotId,
      requestId: this.requestId,
      identity: this.identity,
      documents: this.documents,
      chunks,
      sources: this.sources,
      references,
      capturedAt,
      checksum,
    };
  }
}

/** Helpers for branded ids in builders. */
export function knowledgeIdentityFromIds(input: {
  organizationId: string;
  workspaceId: string;
  userId?: string;
  capabilityId?: string;
  projectId?: string;
  correlationId?: string;
}): KnowledgeIdentity {
  return {
    organizationId: asOrganizationId(input.organizationId),
    workspaceId: asWorkspaceId(input.workspaceId),
    userId: input.userId ? asUserId(input.userId) : undefined,
    capabilityId: input.capabilityId
      ? asCapabilityId(input.capabilityId)
      : undefined,
    projectId: input.projectId,
    correlationId: input.correlationId,
  };
}
