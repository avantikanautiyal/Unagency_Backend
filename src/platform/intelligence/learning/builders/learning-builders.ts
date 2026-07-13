/**
 * Learning request and summary builders.
 */

import { randomUUID } from "crypto";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asUserId,
  asWorkspaceId,
} from "../../shared/identifiers";
import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import type {
  LearningIdentity,
  LearningInsight,
  LearningPattern,
  LearningRecommendation,
  LearningRequest,
  LearningScope,
  LearningSignal,
  LearningSummary,
} from "../contracts/learning-models";
import { LearningValidationError } from "../errors";
import type { ILearningSummaryBuilder } from "../interfaces/learning-ports";

export class LearningRequestBuilder {
  private requestId?: string;
  private identity?: LearningIdentity;
  private scope?: LearningScope;
  private artifacts: ArtifactSnapshot[] = [];
  private attributes?: Readonly<Record<string, unknown>>;

  static create(): LearningRequestBuilder {
    return new LearningRequestBuilder();
  }

  withRequestId(requestId: string): this {
    this.requestId = requestId;
    return this;
  }

  withIdentity(identity: LearningIdentity): this {
    this.identity = identity;
    return this;
  }

  withScope(scope: LearningScope): this {
    this.scope = scope;
    return this;
  }

  withArtifacts(artifacts: readonly ArtifactSnapshot[]): this {
    this.artifacts = [...artifacts];
    return this;
  }

  withAttributes(attributes?: Readonly<Record<string, unknown>>): this {
    this.attributes = attributes;
    return this;
  }

  build(): LearningRequest {
    if (!this.identity || !this.scope) {
      throw new LearningValidationError("identity and scope are required");
    }
    if (!this.artifacts.length) {
      throw new LearningValidationError("artifacts are required");
    }
    return {
      requestId: this.requestId ?? `lreq_${randomUUID()}`,
      identity: this.identity,
      scope: this.scope,
      artifacts: this.artifacts,
      attributes: this.attributes,
    };
  }
}

export function learningIdentityFromIds(input: {
  organizationId: string;
  workspaceId: string;
  userId?: string;
  capabilityId?: string;
  executionId?: string;
  correlationId?: string;
}): LearningIdentity {
  return {
    learningId: `learn_${randomUUID()}`,
    organizationId: asOrganizationId(input.organizationId),
    workspaceId: asWorkspaceId(input.workspaceId),
    userId: input.userId ? asUserId(input.userId) : undefined,
    capabilityId: input.capabilityId ? asCapabilityId(input.capabilityId) : undefined,
    executionId: input.executionId ? asExecutionId(input.executionId) : undefined,
    correlationId: input.correlationId,
  };
}

export class LearningSummaryBuilder implements ILearningSummaryBuilder {
  build(input: {
    request: LearningRequest;
    signals: readonly LearningSignal[];
    patterns: readonly LearningPattern[];
    recommendations: readonly LearningRecommendation[];
    insights: readonly LearningInsight[];
  }): LearningSummary {
    const highlights: string[] = [
      `Analyzed ${input.request.artifacts.length} artifacts`,
      `Extracted ${input.signals.length} signals`,
      `Detected ${input.patterns.length} patterns`,
      `Generated ${input.recommendations.length} recommendations`,
    ];
    if (input.recommendations.length > 0) {
      highlights.push(
        `Top recommendation: ${input.recommendations[0]?.type} (${input.recommendations[0]?.affectedModule})`
      );
    }

    return {
      summaryId: `lsum_${randomUUID()}`,
      signalCount: input.signals.length,
      patternCount: input.patterns.length,
      recommendationCount: input.recommendations.length,
      insightCount: input.insights.length,
      artifactCount: input.request.artifacts.length,
      highlights,
      generatedAt: new Date().toISOString(),
    };
  }
}
