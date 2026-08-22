/**
 * Experience Injection factory.
 */

import type { IExperienceRepository } from "../../experience-intelligence/interfaces/experience-intelligence";
import { ExperienceInjectionEngine } from "../engine/experience-injection-engine";
import { DefaultContextExtractor } from "../retrieval/context-extractor";
import { MemoryAugmentedExperienceRetriever } from "../retrieval/memory-augmented-experience-retriever";
import { DefaultApplicabilityMatcher } from "../applicability/applicability-matcher";
import { DefaultSimilarityEngine } from "../relevance/similarity-engine";
import { PlaceholderSemanticSimilarityEngine } from "../relevance/semantic-similarity";
import { DefaultConflictResolver } from "../conflict-resolution/conflict-resolver";
import { DefaultDeduplicator } from "../deduplication/deduplicator";
import { DefaultPrioritizer } from "../prioritization/prioritizer";
import { DefaultExperienceCompressor } from "../compression/experience-compressor";
import { DefaultExperiencePackager } from "../packaging/experience-packager";
import { DefaultInjectionValidator } from "../validation/injection-validator";
import type { IExperienceInjectionEngine } from "../interfaces/experience-injection";

export interface ExperienceInjectionPlatform {
  readonly engine: IExperienceInjectionEngine;
  readonly repository: IExperienceRepository;
}

export interface CreateExperienceInjectionOptions {
  readonly repository: IExperienceRepository;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export function createExperienceInjectionPlatform(
  options: CreateExperienceInjectionOptions
): ExperienceInjectionPlatform {
  const createId = options.createId ?? ((p) => `${p}_${Date.now()}`);
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());

  const retriever = new MemoryAugmentedExperienceRetriever();

  const engine = new ExperienceInjectionEngine({
    repository: options.repository,
    contextExtractor: new DefaultContextExtractor(),
    retriever,
    applicabilityMatcher: new DefaultApplicabilityMatcher(),
    similarityEngine: new DefaultSimilarityEngine(
      new PlaceholderSemanticSimilarityEngine(),
      nowIso
    ),
    conflictResolver: new DefaultConflictResolver(createId),
    deduplicator: new DefaultDeduplicator(),
    prioritizer: new DefaultPrioritizer(),
    compressor: new DefaultExperienceCompressor(),
    packager: new DefaultExperiencePackager(createId, nowIso),
    validator: new DefaultInjectionValidator(),
    nowIso,
    clockMs,
    createId,
  });

  return { engine, repository: options.repository };
}
