/**
 * Certification matrices — capability, compliance, performance.
 */

import type { CertificationArea } from "./enums";

export interface MatrixCell {
  readonly key: string;
  readonly label: string;
  readonly supported: boolean;
  readonly score?: number;
  readonly notes?: string;
}

export interface CapabilityMatrix {
  readonly matrixId: string;
  readonly providerId: string;
  readonly capabilities: readonly MatrixCell[];
  readonly features: readonly MatrixCell[];
}

export interface ComplianceMatrix {
  readonly matrixId: string;
  readonly areas: readonly {
    readonly area: CertificationArea;
    readonly compliant: boolean;
    readonly score: number;
    readonly issues: readonly string[];
  }[];
  readonly overallCompliant: boolean;
}

export interface PerformanceMatrix {
  readonly matrixId: string;
  readonly benchmarks: readonly {
    readonly scenarioId: string;
    readonly compatible: boolean;
    readonly estimatedLatencyMs?: number;
    readonly notes?: string;
  }[];
}
