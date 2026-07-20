/**
 * Multi-Provider Production Rollout Engine.
 *
 * Integrates every Provider Catalog entry exclusively via Universal Provider Generator.
 * Publishes complete benchmark evidence for Evaluation / Learning / Model Intelligence.
 * Does not redesign Intelligence OS, Runtime, Routing, Negotiation, or Infrastructure.
 */

import { failure, success, type Result } from "../../../intelligence/shared/result";
import { ValidationError } from "../../../intelligence/shared/errors";
import type { CatalogIntegrationEngine } from "../../../intelligence/provider-catalog/integration/catalog-integration-engine";
import type { IObservabilityEngine } from "../../../infrastructure/observability/interfaces/observability";
import type {
  MultiProviderRolloutReport,
  MultiProviderRolloutRequest,
  BenchmarkExecutionEvidence,
  RolloutMode,
} from "../contracts";
import type { IBenchmarkEvidenceStore, IMultiProviderRolloutEngine } from "../interfaces";
import { InMemoryBenchmarkEvidenceStore } from "../evidence/evidence-store";
import {
  buildComparisons,
  buildEvidenceForIntegratedProvider,
} from "../evidence/build-evidence";
import { publishEvidenceToObservability } from "../evidence/publish-observability";
import {
  buildCapabilityCoverage,
  buildCapabilityMappings,
  buildCertifications,
  buildDiscoveries,
  buildModelInventory,
} from "../validation/coverage";
import {
  buildCompatibilityChecklist,
  buildRuntimeRegistration,
} from "../compatibility/compatibility";

export interface MultiProviderRolloutEngineDeps {
  readonly catalog: CatalogIntegrationEngine;
  readonly evidenceStore?: IBenchmarkEvidenceStore;
  readonly observability?: IObservabilityEngine;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  /** When true, OpenAI production validation path is considered attached. */
  readonly productionValidationAttached?: boolean;
}

export class MultiProviderRolloutEngine implements IMultiProviderRolloutEngine {
  private readonly evidenceStore: IBenchmarkEvidenceStore;
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;
  private readonly productionValidationAttached: boolean;

  constructor(private readonly deps: MultiProviderRolloutEngineDeps) {
    this.evidenceStore = deps.evidenceStore ?? new InMemoryBenchmarkEvidenceStore();
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${this.clockMs()}`);
    this.productionValidationAttached = deps.productionValidationAttached ?? true;
  }

  async rollout(
    request: MultiProviderRolloutRequest
  ): Promise<Result<MultiProviderRolloutReport>> {
    const start = this.clockMs();
    if (!request.requestId?.trim()) {
      return failure(new ValidationError("requestId is required"));
    }

    const mode: RolloutMode = request.mode ?? "catalog_simulated";

    // EVERY provider through Universal Provider Generator via Official Catalog.
    const integration = await this.deps.catalog.integrate({
      requestId: `${request.requestId}_catalog`,
      providerIds: request.providerIds,
      requireCertificationForActive: request.requireCertificationForActive ?? true,
    });
    if (!integration.ok) return integration;

    const catalogReport = integration.value;
    const integrated = catalogReport.providersIntegrated;

    const discoveries = buildDiscoveries(integrated);
    const modelInventory = buildModelInventory(integrated);
    const capabilityMappings = buildCapabilityMappings(integrated);
    const capabilityCoverage = buildCapabilityCoverage(capabilityMappings, modelInventory);
    const runtimeRegistrations = integrated.map(buildRuntimeRegistration);
    const certifications = buildCertifications(integrated);

    const evidence: BenchmarkExecutionEvidence[] = [];
    for (const rec of integrated) {
      const rows = buildEvidenceForIntegratedProvider(rec, {
        createId: this.createId,
        nowIso: this.nowIso,
        correlationPrefix: request.requestId,
      });
      for (const e of rows) {
        this.evidenceStore.add(e);
        evidence.push(e);
      }
    }

    if (request.publishObservability !== false && this.deps.observability) {
      const pub = publishEvidenceToObservability(
        this.deps.observability,
        evidence,
        this.createId
      );
      if (!pub.ok) return pub;
    }

    const comparisons = buildComparisons(evidence);
    const multiProviderCapabilityCount = capabilityCoverage.filter(
      (c) => c.multiProviderEligible
    ).length;

    const compatibility = buildCompatibilityChecklist(
      runtimeRegistrations,
      this.productionValidationAttached
    );

    const successCriteria = {
      sameCapabilityAcrossProviders: multiProviderCapabilityCount > 0,
      routingCanChoose: comparisons.some((c) => c.routingChoiceEligible),
      consensusCanCombine: comparisons.some((c) => c.consensusEligible),
      evaluationCanCompare: comparisons.some((c) => c.evaluationComparable),
      learningCanCompare: comparisons.some((c) => c.learningComparable),
      evidenceDrivenRecommendationsReady:
        evidence.length > 0 &&
        evidence.every(
          (e) =>
            e.capabilityId &&
            e.providerId &&
            e.modelId &&
            typeof e.latencyMs === "number" &&
            typeof e.cost === "number" &&
            typeof e.totalTokens === "number" &&
            typeof e.evaluationScore === "number"
        ),
    };

    return success({
      requestId: request.requestId,
      mode,
      providerCount: catalogReport.providerCount,
      modelCount: modelInventory.length,
      generationFileCount: catalogReport.generationFileCount,
      activeCount: catalogReport.activeCount,
      experimentalCount: catalogReport.experimentalCount,
      allViaGenerator: true,
      skippedInventedProviders: 0,
      multiProviderCapabilityCount,
      discoveries,
      modelInventory,
      capabilityMappings,
      capabilityCoverage,
      runtimeRegistrations,
      certifications,
      evidence,
      comparisons,
      compatibility,
      productionValidationAttached: this.productionValidationAttached,
      durationMs: this.clockMs() - start,
      createdAt: this.nowIso(),
      successCriteria,
    });
  }

  listEvidence(): Result<readonly BenchmarkExecutionEvidence[]> {
    return success(this.evidenceStore.list());
  }

  getEvidence(evidenceId: string): Result<BenchmarkExecutionEvidence | undefined> {
    return success(this.evidenceStore.get(evidenceId));
  }
}
