/**
 * Provider operational state + scores.
 */

import type { ProviderOperationalState } from "./enums";
import type { CertificationStatus } from "../../provider-certification/contracts/enums";

export interface ProviderTelemetryWindow {
  readonly sampleCount: number;
  readonly averageLatencyMs: number;
  readonly p95LatencyMs: number;
  readonly errorRate: number;
  readonly retryRate: number;
  readonly timeoutRate: number;
  readonly availability: number;
  readonly concurrentExecutions: number;
  readonly capacityUtilization: number;
  readonly averageCost: number;
  readonly averageQuality: number;
  readonly successRate: number;
  readonly healthTrend: "improving" | "stable" | "worsening";
}

export interface ProviderScoreBreakdown {
  readonly availability: number;
  readonly latency: number;
  readonly reliability: number;
  readonly quality: number;
  readonly historicalSuccess: number;
  readonly cost: number;
  readonly certification: number;
  readonly currentLoad: number;
  readonly overall: number;
}

export interface ProviderOperationalRecord {
  readonly providerId: string;
  readonly state: ProviderOperationalState;
  readonly healthScore: number;
  readonly performanceScore: number;
  readonly reliabilityScore: number;
  readonly availabilityScore: number;
  readonly compositeScore: ProviderScoreBreakdown;
  readonly telemetry: ProviderTelemetryWindow;
  readonly certificationStatus?: CertificationStatus;
  readonly lastHeartbeatAt: string;
  readonly explanation: string;
}
