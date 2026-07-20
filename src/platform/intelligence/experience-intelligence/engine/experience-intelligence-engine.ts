/**
 * Experience Intelligence Engine.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import { asExperienceReportId } from "../contracts/identifiers";
import type { ExperienceIntelligenceRequest } from "../contracts/request";
import type { ExperienceIntelligenceReport } from "../contracts/result";
import type { ExperienceSearchQuery, ExperienceSearchResult } from "../contracts/search";
import type { ExperienceSnapshot } from "../contracts/snapshot";
import type { Experience } from "../contracts/experience";
import type {
  IExperienceIntelligenceEngine,
  IExperienceRepository,
  IExperienceExtractor,
  IRootCauseAnalyzer,
  ICorrectionStrategist,
  IApplicabilityEngine,
  IExperienceConfidenceEngine,
  IExperienceValidator,
  IExperienceSearchEngine,
} from "../interfaces/experience-intelligence";
import { detectMistakesAndSuccesses } from "../analysis/mistake-success-detector";

export interface ExperienceIntelligenceEngineDeps {
  readonly repository: IExperienceRepository;
  readonly extractor: IExperienceExtractor;
  readonly rootCauseAnalyzer: IRootCauseAnalyzer;
  readonly correctionStrategist: ICorrectionStrategist;
  readonly applicabilityEngine: IApplicabilityEngine;
  readonly confidenceEngine: IExperienceConfidenceEngine;
  readonly validator: IExperienceValidator;
  readonly searchEngine: IExperienceSearchEngine;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class ExperienceIntelligenceEngine implements IExperienceIntelligenceEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: ExperienceIntelligenceEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Date.now()}`);
  }

  async process(request: ExperienceIntelligenceRequest): Promise<Result<ExperienceIntelligenceReport>> {
    const start = this.clockMs();
    const invalid = this.validate(request);
    if (invalid) return failure(invalid);

    const extracted = this.deps.extractor.extract(request.inputs);
    if (!extracted.ok) return extracted;

    const detection = detectMistakesAndSuccesses(extracted.value, request.inputs);

    const scored: Experience[] = [];
    for (const exp of extracted.value) {
      const scores = this.deps.confidenceEngine.score(request.inputs, exp);
      if (!scores.ok) return scores;
      const validated = this.deps.validator.validate(exp);
      if (!validated.ok) continue;
      scored.push(
        Object.freeze({
          ...exp,
          scores: scores.value,
          confidence: scores.value.confidence,
          lifecycle: scores.value.confidence >= 0.7 ? "validated" : "draft",
        })
      );
    }

    const saved = this.deps.repository.saveMany(scored);
    if (!saved.ok) return saved;

    const rootCauses = this.deps.rootCauseAnalyzer.analyze(request.inputs, scored);
    if (!rootCauses.ok) return rootCauses;

    const corrections = this.deps.correctionStrategist.generate(rootCauses.value, scored);
    if (!corrections.ok) return corrections;

    const applicability = this.deps.applicabilityEngine.derive(request.inputs, scored);
    if (!applicability.ok) return applicability;

    const snap = this.deps.repository.snapshot();
    if (!snap.ok) return snap;

    const executionsProcessed = this.countInputs(request);

    return success({
      reportId: asExperienceReportId(this.createId("eir")),
      requestId: request.requestId,
      experiences: scored,
      rootCauses: rootCauses.value,
      correctionStrategies: corrections.value,
      applicabilityMaps: applicability.value,
      snapshot: snap.value,
      explanation: Object.freeze({
        whyExists: `Extracted ${scored.length} experiences from ${executionsProcessed} historical inputs`,
        evidenceSummary: `${detection.successes.length} successes, ${detection.mistakes.length} mistakes, ${detection.warnings.length} warnings`,
        whenApplies: "Applicable to matching capability, workflow, and context dimensions",
        whenNotApplies: "Different organization scope or expired experiences",
        historicalImprovement: `Average improvement ${this.avgImprovement(scored).toFixed(2)}`,
      }),
      statistics: Object.freeze({
        executionsProcessed,
        experiencesExtracted: scored.length,
        positiveExperiences: detection.successes.length,
        negativeExperiences: detection.mistakes.length,
        rootCausesIdentified: rootCauses.value.length,
        correctionsGenerated: corrections.value.length,
        totalDurationMs: this.clockMs() - start,
      }),
      createdAt: this.nowIso(),
    });
  }

  async search(query: ExperienceSearchQuery): Promise<Result<ExperienceSearchResult>> {
    return this.deps.searchEngine.search(this.deps.repository, query);
  }

  async snapshot(): Promise<Result<ExperienceSnapshot>> {
    return this.deps.repository.snapshot();
  }

  private validate(request: ExperienceIntelligenceRequest): ValidationError | null {
    if (!request.requestId?.trim()) return new ValidationError("requestId required");
    if (!request.inputs) return new ValidationError("inputs required");
    return null;
  }

  private countInputs(request: ExperienceIntelligenceRequest): number {
    const i = request.inputs;
    return (
      (i.evaluationReports?.length ?? 0) +
      (i.learningResults?.length ?? 0) +
      (i.optimizationResults?.length ?? 0) +
      (i.observabilityReports?.length ?? 0) +
      (i.modelDecisionRecords?.length ?? 0) +
      (i.humanArtifacts?.length ?? 0) +
      (request.batchSize ?? 0)
    );
  }

  private avgImprovement(experiences: readonly Experience[]): number {
    if (experiences.length === 0) return 0;
    return experiences.reduce((s, e) => s + e.averageImprovement, 0) / experiences.length;
  }
}
