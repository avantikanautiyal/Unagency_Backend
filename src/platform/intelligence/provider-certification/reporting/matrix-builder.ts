/**
 * Matrix builder — capability, compliance, performance matrices.
 */

import type {
  CapabilityMatrix,
  ComplianceMatrix,
  PerformanceMatrix,
} from "../contracts/matrices";
import type { BenchmarkScenario } from "../contracts/benchmarks";
import type { SuiteResult } from "../contracts/suite-result";
import type { CertificationHarness } from "../fixtures/harness";
import type { IMatrixBuilder } from "../interfaces/certification";
import type { CertificationArea } from "../contracts/enums";
import { CERTIFICATION_AREAS } from "../constants";

export class DefaultMatrixBuilder implements IMatrixBuilder {
  buildCapabilityMatrix(
    harness: CertificationHarness,
    _suiteResults: readonly SuiteResult[]
  ): CapabilityMatrix {
    const descriptor = harness.adapter.describe();
    return Object.freeze({
      matrixId: `cap_${harness.manifest.providerId}`,
      providerId: String(harness.manifest.providerId),
      capabilities: harness.manifest.capabilities.map((c) => ({
        key: c,
        label: c,
        supported: true,
      })),
      features: descriptor.supportedFeatures.map((f) => ({
        key: f,
        label: f,
        supported: true,
      })),
    });
  }

  buildComplianceMatrix(suiteResults: readonly SuiteResult[]): ComplianceMatrix {
    const areaMap = new Map<CertificationArea, { issues: string[]; score: number }>();

    for (const area of CERTIFICATION_AREAS) {
      areaMap.set(area, { issues: [], score: 100 });
    }

    for (const suite of suiteResults) {
      for (const issue of suite.issues) {
        const entry = areaMap.get(issue.area);
        if (entry) {
          entry.issues.push(issue.message);
          if (issue.severity === "error") entry.score = Math.max(0, entry.score - 30);
          else if (issue.severity === "warning") entry.score = Math.max(0, entry.score - 10);
        }
      }
    }

    const areas = CERTIFICATION_AREAS.map((area) => {
      const entry = areaMap.get(area)!;
      return {
        area,
        score: entry.score,
        issues: entry.issues,
        compliant: entry.score >= 70,
      };
    });

    return Object.freeze({
      matrixId: "compliance_matrix",
      areas,
      overallCompliant: areas.every((a) => a.compliant),
    });
  }

  buildPerformanceMatrix(benchmarks: readonly BenchmarkScenario[]): PerformanceMatrix {
    return Object.freeze({
      matrixId: "perf_matrix",
      benchmarks: benchmarks.map((b) => ({
        scenarioId: b.scenarioId,
        compatible: b.compatible,
        estimatedLatencyMs: b.compatible ? 50 : undefined,
        notes: b.compatible ? "Interface compatible" : "Missing required features",
      })),
    });
  }
}
