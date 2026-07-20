/**
 * Experience Intelligence factory.
 */

import { ExperienceIntelligenceEngine } from "../engine/experience-intelligence-engine";
import { InMemoryExperienceRepository } from "../experience-repository/in-memory-experience-repository";
import { DefaultExperienceExtractor } from "../extraction/experience-extractor";
import { DefaultExperienceBuilder } from "../experience-builder/default-experience-builder";
import { DefaultRootCauseAnalyzer } from "../root-cause/root-cause-analyzer";
import { DefaultCorrectionStrategist } from "../correction/correction-strategist";
import { DefaultApplicabilityEngine } from "../applicability/applicability-engine";
import { DefaultExperienceConfidenceEngine } from "../confidence/confidence-engine";
import { DefaultExperienceValidator } from "../validation/experience-validator";
import { DefaultExperienceSearchEngine } from "../search/experience-search-engine";
import type { IExperienceIntelligenceEngine } from "../interfaces/experience-intelligence";

export interface ExperienceIntelligencePlatform {
  readonly engine: IExperienceIntelligenceEngine;
  readonly repository: InMemoryExperienceRepository;
}

export interface CreateExperienceIntelligenceOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export function createExperienceIntelligencePlatform(
  options: CreateExperienceIntelligenceOptions = {}
): ExperienceIntelligencePlatform {
  const createId = options.createId ?? ((p) => `${p}_${Date.now()}`);
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());

  const repository = new InMemoryExperienceRepository(nowIso, createId);
  const builder = new DefaultExperienceBuilder(nowIso);
  const extractor = new DefaultExperienceExtractor(builder, createId);

  const engine = new ExperienceIntelligenceEngine({
    repository,
    extractor,
    rootCauseAnalyzer: new DefaultRootCauseAnalyzer(),
    correctionStrategist: new DefaultCorrectionStrategist(createId),
    applicabilityEngine: new DefaultApplicabilityEngine(),
    confidenceEngine: new DefaultExperienceConfidenceEngine(),
    validator: new DefaultExperienceValidator(),
    searchEngine: new DefaultExperienceSearchEngine(),
    nowIso,
    clockMs,
    createId,
  });

  return { engine, repository };
}
