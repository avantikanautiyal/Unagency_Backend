/**
 * Context Intelligence Engine.
 *
 * Purpose: Build provider-independent IntelligenceContext for downstream modules.
 * Responsibilities: Build → enrich → normalize → validate → snapshot.
 * Usage: Invoked before Prompt Compiler (future).
 * Future Extension: Knowledge placeholders (not retrieval).
 */

import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { ContextBuildRequest } from "../contracts/context-build-request";
import type {
  ContextSnapshot,
  IntelligenceContext,
} from "../contracts/intelligence-context";
import { ContextError } from "../errors";
import type { IIntelligenceContextBuilder } from "../interfaces/builders";
import type { IContextIntelligenceEngine } from "../interfaces/engine";
import type { IContextEnrichmentPipeline } from "../interfaces/enrichment";
import type { IContextNormalizer } from "../interfaces/normalization";
import type { IContextValidator } from "../interfaces/validation";

export interface ContextIntelligenceEngineDependencies {
  readonly builder: IIntelligenceContextBuilder;
  readonly enrichment: IContextEnrichmentPipeline;
  readonly normalizer: IContextNormalizer;
  readonly validator: IContextValidator;
  readonly nowIso?: () => string;
  readonly createSnapshotId?: () => string;
}

export class ContextIntelligenceEngine implements IContextIntelligenceEngine {
  private readonly nowIso: () => string;
  private readonly createSnapshotId: () => string;

  constructor(private readonly deps: ContextIntelligenceEngineDependencies) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.createSnapshotId =
      deps.createSnapshotId ?? (() => `snap_${randomUUID()}`);
  }

  async build(
    request: ContextBuildRequest
  ): Promise<Result<IntelligenceContext>> {
    const built = await this.deps.builder.build(request);
    if (!built.ok) {
      return built;
    }

    const enriched = await this.deps.enrichment.enrich(request, {
      ...built.value,
    });
    if (!enriched.ok) {
      return enriched;
    }

    // Enrichment returns partial; merge onto built context
    const merged: IntelligenceContext = {
      ...built.value,
      ...(enriched.value as Partial<IntelligenceContext>),
      metadata: built.value.metadata,
      identity: built.value.identity,
      scope: built.value.scope,
    };

    const normalized = this.deps.normalizer.normalize(merged);
    const validated = this.deps.validator.validate(normalized);
    if (!validated.ok) {
      return failure(
        validated.error instanceof ContextError
          ? validated.error
          : new ContextError("Context validation failed", {
              cause: validated.error,
            })
      );
    }

    if (!validated.value.context) {
      return failure(new ContextError("Validated context missing"));
    }

    return success(validated.value.context);
  }

  async snapshot(
    request: ContextBuildRequest
  ): Promise<Result<ContextSnapshot>> {
    const context = await this.build(request);
    if (!context.ok) {
      return context;
    }

    const capturedAt = this.nowIso();
    const checksum = createHash("sha256")
      .update(
        JSON.stringify({
          id: context.value.metadata.contextId,
          org: context.value.identity.organizationId,
          ws: context.value.identity.workspaceId,
          cap: context.value.scope.capabilityId,
          at: capturedAt,
        })
      )
      .digest("hex")
      .slice(0, 16);

    return success({
      snapshotId: this.createSnapshotId(),
      context: context.value,
      capturedAt,
      checksum,
    });
  }
}
