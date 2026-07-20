/**
 * Provider Mesh testing utilities.
 */

import type { ProviderMeshEvent } from "../contracts/inputs";
import type { CertificationStatus } from "../../provider-certification/contracts/enums";
import { ProviderMeshRequestBuilder } from "../builders/mesh-request-builder";
import {
  createProviderMeshPlatform,
  type CreateProviderMeshOptions,
  type ProviderMeshPlatform,
} from "../factories/create-provider-mesh-platform";
import { asProviderId } from "../../shared/identifiers";
import type { ProviderExecutionResult } from "../../providers/runtime/contracts/provider-execution-response";

export function deterministicHelpers() {
  let id = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => "2026-07-14T00:00:00.000Z",
    clockMs: () => (ms += 5),
  };
}

export function makeObservabilityEvent(
  providerId: string,
  opts: {
    latencyMs?: number;
    errorRate?: number;
    successRate?: number;
    qualityScore?: number;
    cost?: number;
    capacityUtilization?: number;
    concurrentExecutions?: number;
    certificationStatus?: CertificationStatus;
    rateLimited?: boolean;
    maintenance?: boolean;
    deprecated?: boolean;
    experimental?: boolean;
    eventId?: string;
  } = {}
): ProviderMeshEvent {
  return {
    eventId: opts.eventId ?? `evt_${providerId}_${Math.random().toString(36).slice(2, 8)}`,
    providerId,
    kind: "telemetry",
    observedAt: "2026-07-14T00:00:00.000Z",
    certificationStatus: opts.certificationStatus,
    rateLimited: opts.rateLimited,
    maintenance: opts.maintenance,
    deprecated: opts.deprecated,
    experimental: opts.experimental,
    observability: {
      reportId: `obs_${providerId}`,
      providerId,
      latencyMs: opts.latencyMs ?? 120,
      cost: opts.cost ?? 0.01,
      successRate: opts.successRate ?? 0.95,
      errorRate: opts.errorRate ?? 0.05,
      qualityScore: opts.qualityScore ?? 0.85,
      observedAt: "2026-07-14T00:00:00.000Z",
    },
    metrics: {
      capacityUtilization: opts.capacityUtilization ?? 0.35,
      concurrentExecutions: opts.concurrentExecutions ?? 2,
      p95LatencyMs: (opts.latencyMs ?? 120) * 1.4,
      availability: opts.successRate ?? 0.95,
    },
  };
}

export function makeExecutionEvent(
  providerId: string,
  opts: { success?: boolean; totalMs?: number; retries?: number } = {}
): ProviderMeshEvent {
  const ok = opts.success ?? true;
  const execution: ProviderExecutionResult = {
    requestId: `req_${providerId}`,
    sessionId: `sess_${providerId}`,
    status: ok ? "completed" : "failed",
    success: ok,
    response: ok
      ? {
          requestId: `req_${providerId}`,
          providerId: asProviderId(providerId),
          output: { content: "ok" },
          streamed: false,
          finishedAt: "2026-07-14T00:00:00.000Z",
        }
      : undefined,
    error: ok ? undefined : { code: "x", message: "fail" },
    statistics: {
      queueWaitMs: 0,
      dispatchMs: 2,
      executionMs: opts.totalMs ?? 100,
      streamingMs: 0,
      totalMs: opts.totalMs ?? 100,
      attempts: 1 + (opts.retries ?? 0),
      retries: opts.retries ?? 0,
      timeouts: 0,
      streamingChunks: 0,
    },
    completedAt: "2026-07-14T00:00:00.000Z",
  };

  return {
    eventId: `exec_${providerId}`,
    providerId,
    kind: "execution",
    observedAt: "2026-07-14T00:00:00.000Z",
    execution,
  };
}

export function sampleMultiProviderEvents(): ProviderMeshEvent[] {
  return [
    makeObservabilityEvent("openai", {
      eventId: "e1",
      latencyMs: 180,
      errorRate: 0.04,
      successRate: 0.96,
      qualityScore: 0.88,
      cost: 0.02,
      certificationStatus: "certified",
      capacityUtilization: 0.4,
    }),
    makeObservabilityEvent("anthropic", {
      eventId: "e2",
      latencyMs: 220,
      errorRate: 0.03,
      successRate: 0.97,
      qualityScore: 0.9,
      cost: 0.03,
      certificationStatus: "certified",
      capacityUtilization: 0.35,
    }),
    makeObservabilityEvent("gemini", {
      eventId: "e3",
      latencyMs: 140,
      errorRate: 0.08,
      successRate: 0.9,
      qualityScore: 0.78,
      cost: 0.01,
      certificationStatus: "certified_with_warnings",
      capacityUtilization: 0.55,
    }),
    makeObservabilityEvent("experimental-model", {
      eventId: "e4",
      latencyMs: 300,
      errorRate: 0.12,
      successRate: 0.85,
      qualityScore: 0.7,
      cost: 0.015,
      certificationStatus: "experimental",
      experimental: true,
      capacityUtilization: 0.2,
    }),
    makeObservabilityEvent("degraded-provider", {
      eventId: "e5",
      latencyMs: 900,
      errorRate: 0.28,
      successRate: 0.65,
      qualityScore: 0.5,
      cost: 0.04,
      capacityUtilization: 0.9,
    }),
    makeExecutionEvent("openai", { success: true, totalMs: 175 }),
    makeExecutionEvent("anthropic", { success: true, totalMs: 210 }),
  ];
}

export function sampleMeshRequest() {
  return ProviderMeshRequestBuilder.create()
    .withRequestId("mesh_req_1")
    .withEvents(sampleMultiProviderEvents())
    .build();
}

export function setupProviderMeshPlatform(
  options: CreateProviderMeshOptions = {}
): ProviderMeshPlatform {
  const helpers = deterministicHelpers();
  return createProviderMeshPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}
