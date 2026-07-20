/**
 * Experience Injection Engine.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import type { IExperienceRepository } from "../../experience-intelligence/interfaces/experience-intelligence";
import { asExperienceInjectionResultId } from "../contracts/identifiers";
import type { ExperienceInjectionRequest } from "../contracts/request";
import type { ExperienceInjectionReport } from "../contracts/result";
import type {
  IExperienceInjectionEngine,
  IContextExtractor,
  IExperienceRetriever,
  IApplicabilityMatcher,
  ISimilarityEngine,
  IConflictResolver,
  IDeduplicator,
  IPrioritizer,
  IExperienceCompressor,
  IExperiencePackager,
  IInjectionValidator,
} from "../interfaces/experience-injection";
import { filterByMinimumConfidence, filterDeprecated } from "../filtering/experience-filter";
import { DEFAULT_MAX_CONTEXT_ITEMS, DEFAULT_TOP_N } from "../constants";

export interface ExperienceInjectionEngineDeps {
  readonly repository: IExperienceRepository;
  readonly contextExtractor: IContextExtractor;
  readonly retriever: IExperienceRetriever;
  readonly applicabilityMatcher: IApplicabilityMatcher;
  readonly similarityEngine: ISimilarityEngine;
  readonly conflictResolver: IConflictResolver;
  readonly deduplicator: IDeduplicator;
  readonly prioritizer: IPrioritizer;
  readonly compressor: IExperienceCompressor;
  readonly packager: IExperiencePackager;
  readonly validator: IInjectionValidator;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class ExperienceInjectionEngine implements IExperienceInjectionEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: ExperienceInjectionEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Date.now()}`);
  }

  async inject(
    request: ExperienceInjectionRequest
  ): Promise<Result<ExperienceInjectionReport>> {
    const start = this.clockMs();
    const invalid = this.validate(request);
    if (invalid) return failure(invalid);

    const topN = request.topN ?? DEFAULT_TOP_N;
    const maxItems = request.maxContextItems ?? DEFAULT_MAX_CONTEXT_ITEMS;
    const conflictStrategy = request.conflictStrategy ?? "highest_confidence";

    // 1. Context extraction
    const context = this.deps.contextExtractor.extract(request);

    // 2. Retrieval
    const retrieved = this.deps.retriever.retrieve(this.deps.repository, context);
    if (!retrieved.ok) return retrieved;
    const candidatesRetrieved = retrieved.value.length;

    // 3. Filtering
    let candidates = filterDeprecated(retrieved.value);
    candidates = filterByMinimumConfidence([...candidates], 0.2);

    // 4. Applicability matching
    const applicable = this.deps.applicabilityMatcher.match(candidates, context);
    if (!applicable.ok) return applicable;
    const afterApplicability = applicable.value.length;

    // 5. Similarity scoring
    const scores = this.deps.similarityEngine.score(applicable.value, context);
    if (!scores.ok) return scores;

    // 6. Deduplication
    const deduped = this.deps.deduplicator.deduplicate(applicable.value);
    if (!deduped.ok) return deduped;
    const afterDeduplication = deduped.value.length;

    // 7. Conflict resolution
    const conflicts = this.deps.conflictResolver.resolve(deduped.value, conflictStrategy);
    if (!conflicts.ok) return conflicts;
    const afterConflictResolution = conflicts.value.resolved.length;

    // 8. Prioritization
    const priorities = this.deps.prioritizer.prioritize(
      conflicts.value.resolved,
      scores.value
    );
    if (!priorities.ok) return priorities;

    // 9. Compression
    const compressed = this.deps.compressor.compress(
      conflicts.value.resolved,
      scores.value,
      priorities.value,
      topN,
      maxItems
    );
    if (!compressed.ok) return compressed;
    const afterCompression = compressed.value.length;

    // 10. Packaging
    const pkg = this.deps.packager.package(
      request,
      compressed.value,
      scores.value,
      conflicts.value,
      candidatesRetrieved
    );
    if (!pkg.ok) return pkg;

    // 11. Validation
    const valid = this.deps.validator.validate(pkg.value);
    if (!valid.ok) return valid;

    return success({
      resultId: asExperienceInjectionResultId(this.createId("inj")),
      request,
      package: pkg.value,
      relevanceScores: scores.value,
      conflictResult: conflicts.value,
      statistics: Object.freeze({
        candidatesRetrieved,
        afterApplicability,
        afterDeduplication,
        afterConflictResolution,
        afterCompression,
        totalDurationMs: this.clockMs() - start,
      }),
      createdAt: this.nowIso(),
    });
  }

  private validate(request: ExperienceInjectionRequest): ValidationError | null {
    if (!request.requestId?.trim()) return new ValidationError("requestId required");
    if (!request.context) return new ValidationError("context required");
    return null;
  }
}
