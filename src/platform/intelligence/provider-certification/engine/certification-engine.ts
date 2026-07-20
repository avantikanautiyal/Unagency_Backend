/**
 * Provider Certification Engine.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import { asCertificationReportId } from "../contracts/identifiers";
import type { CertificationRequest } from "../contracts/request";
import type { ProviderCertificationReport } from "../contracts/result";
import { deriveCompatibilityProfile } from "../contracts/profile";
import type { IProviderCertificationEngine } from "../interfaces/certification";
import type { CertificationHarness } from "../fixtures/harness";
import { createCertificationSuites } from "../suites/certification-suites";
import { DefaultScorecardBuilder } from "../scorecards/scorecard-builder";
import { DefaultMatrixBuilder } from "../reporting/matrix-builder";
import { DefaultBadgeIssuer } from "../badges/badge-issuer";
import {
  buildRecommendations,
  buildFailureReport,
} from "../reporting/recommendation-builder";
import { resolveCertificationStatus } from "../reporting/status-resolver";
import {
  assessBenchmarkCompatibility,
  buildBenchmarkCatalog,
} from "../scenarios/benchmark-catalog";

export interface CertificationEngineDeps {
  readonly scorecardBuilder?: import("../interfaces/certification").IScorecardBuilder;
  readonly matrixBuilder?: import("../interfaces/certification").IMatrixBuilder;
  readonly badgeIssuer?: import("../interfaces/certification").IBadgeIssuer;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class ProviderCertificationEngine implements IProviderCertificationEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;
  private readonly scorecardBuilder: import("../interfaces/certification").IScorecardBuilder;
  private readonly matrixBuilder: import("../interfaces/certification").IMatrixBuilder;
  private readonly badgeIssuer: import("../interfaces/certification").IBadgeIssuer;

  constructor(deps: CertificationEngineDeps = {}) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Date.now()}`);
    this.scorecardBuilder = deps.scorecardBuilder ?? new DefaultScorecardBuilder();
    this.matrixBuilder = deps.matrixBuilder ?? new DefaultMatrixBuilder();
    this.badgeIssuer = deps.badgeIssuer ?? new DefaultBadgeIssuer(this.createId, this.nowIso);
  }

  async certify(request: CertificationRequest): Promise<Result<ProviderCertificationReport>> {
    const invalid = this.validate(request);
    if (invalid) return failure(invalid);

    const start = this.clockMs();
    const harness: CertificationHarness = {
      adapter: request.adapter,
      manifest: request.manifest,
      clockMs: this.clockMs,
    };

    const suites = createCertificationSuites(this.createId, this.clockMs);
    const suiteResults = [];
    for (const suite of suites) {
      const result = suite.run(harness);
      if (!result.ok) return result;
      suiteResults.push(result.value);
    }

    const scorecard = this.scorecardBuilder.build(suiteResults);
    const descriptor = request.adapter.describe();
    const benchmarkScenarios = assessBenchmarkCompatibility(descriptor.supportedFeatures);

    const capabilityMatrix = this.matrixBuilder.buildCapabilityMatrix(harness, suiteResults);
    const complianceMatrix = this.matrixBuilder.buildComplianceMatrix(suiteResults);
    const performanceMatrix = this.matrixBuilder.buildPerformanceMatrix(benchmarkScenarios);

    const compatibilityProfile = deriveCompatibilityProfile(request.manifest);
    const qualityReport = Object.freeze({
      reportId: this.createId("quality"),
      providerId: String(request.manifest.providerId),
      benchmarkCompatibility: benchmarkScenarios.map((b) => ({
        scenarioId: b.scenarioId,
        compatible: b.compatible,
        reason: b.compatible ? undefined : `Missing features: ${b.requiredFeatures.join(", ")}`,
      })),
      qualityScore: Math.round(
        (benchmarkScenarios.filter((b) => b.compatible).length / benchmarkScenarios.length) * 100
      ),
      notes: [],
    });

    const status = resolveCertificationStatus(request.manifest, scorecard, suiteResults);
    const recommendations = buildRecommendations(suiteResults);
    const failureReport = buildFailureReport(suiteResults, this.createId);

    const createdAt = this.nowIso();
    const draft: Omit<ProviderCertificationReport, "badge"> & { badge?: ProviderCertificationReport["badge"] } = {
      reportId: asCertificationReportId(this.createId("cert")),
      requestId: request.requestId,
      providerId: String(request.manifest.providerId),
      vendor: request.manifest.vendor,
      status,
      scorecard,
      capabilityMatrix,
      complianceMatrix,
      performanceMatrix,
      compatibilityProfile,
      qualityReport,
      suiteResults,
      failureReport,
      recommendations,
      statistics: Object.freeze({
        suitesRun: suiteResults.length,
        suitesPassed: suiteResults.filter((s) => s.outcome === "pass").length,
        suitesFailed: suiteResults.filter((s) => s.outcome === "fail").length,
        totalDurationMs: this.clockMs() - start,
      }),
      createdAt,
    };

    const badge = this.badgeIssuer.issue(draft as ProviderCertificationReport);
    return success({ ...draft, badge } as ProviderCertificationReport);
  }

  private validate(request: CertificationRequest): ValidationError | null {
    if (!request.requestId?.trim()) return new ValidationError("requestId required");
    if (!request.adapter) return new ValidationError("adapter required");
    if (!request.manifest) return new ValidationError("manifest required");
    return null;
  }
}
