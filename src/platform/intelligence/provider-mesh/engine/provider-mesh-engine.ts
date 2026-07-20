/**
 * Provider Mesh Engine — pipeline:
 * Events → Health → Telemetry → Metrics → State → Score → Hints → Snapshot
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import type { ProviderMeshRequest, ProviderMeshEvent } from "../contracts/inputs";
import type { ProviderMeshReport, ProviderMeshSnapshot } from "../contracts/result";
import type { ProviderOperationalRecord } from "../contracts/state";
import {
  asMeshResultId,
  asProviderMeshSnapshotId,
} from "../contracts/identifiers";
import type {
  IProviderMeshEngine,
  IMeshRegistry,
  ITelemetryAggregator,
  IHealthEvaluator,
  IProviderScorer,
  IRoutingHintBuilder,
  IFailoverPlanner,
  ICanaryPlanner,
  IShadowPlanner,
} from "../interfaces/mesh";
import type { DefaultTopologyBuilder } from "../topology/default-topology-builder";
import type { DefaultCapacityReporter } from "../capacity/default-capacity-reporter";
import {
  certificationBoost,
  resolveCertificationStatus,
} from "../provider-state/certification-boost";
import { PROVIDER_MESH_VERSION } from "../constants";

export interface ProviderMeshEngineDeps {
  readonly registry: IMeshRegistry;
  readonly telemetry: ITelemetryAggregator;
  readonly health: IHealthEvaluator;
  readonly scorer: IProviderScorer;
  readonly routingHints: IRoutingHintBuilder;
  readonly failover: IFailoverPlanner;
  readonly canary: ICanaryPlanner;
  readonly shadow: IShadowPlanner;
  readonly topology: DefaultTopologyBuilder;
  readonly capacity: DefaultCapacityReporter;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class ProviderMeshEngine implements IProviderMeshEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;
  private lastSnapshot: ProviderMeshSnapshot | undefined;

  constructor(private readonly deps: ProviderMeshEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Date.now()}`);
  }

  async observe(request: ProviderMeshRequest): Promise<Result<ProviderMeshReport>> {
    const start = this.clockMs();
    const invalid = this.validate(request);
    if (invalid) return failure(invalid);

    const byProvider = groupEvents(request.events, request.providerIds);
    const records: ProviderOperationalRecord[] = [];

    for (const [providerId, events] of byProvider) {
      const telemetry = this.deps.telemetry.aggregate(providerId, events);
      if (!telemetry.ok) return telemetry;

      const health = this.deps.health.evaluate(providerId, telemetry.value, events);
      if (!health.ok) return health;

      const cert = resolveCertificationStatus(events);
      const scores = this.deps.scorer.score(
        telemetry.value,
        health.value.healthScore,
        certificationBoost(cert)
      );
      if (!scores.ok) return scores;

      const lastHeartbeatAt =
        events[events.length - 1]?.observedAt ?? this.nowIso();

      const record: ProviderOperationalRecord = {
        providerId,
        state: health.value.state,
        healthScore: health.value.healthScore,
        performanceScore: scores.value.latency,
        reliabilityScore: scores.value.reliability,
        availabilityScore: scores.value.availability,
        compositeScore: scores.value,
        telemetry: telemetry.value,
        certificationStatus: cert,
        lastHeartbeatAt,
        explanation: health.value.explanation,
      };

      const upserted = this.deps.registry.upsert(record);
      if (!upserted.ok) return upserted;
      records.push(record);
    }

    // Merge with previously known providers not in this batch when requested.
    if (request.providerIds && request.providerIds.length > 0) {
      const listed = this.deps.registry.list();
      if (!listed.ok) return listed;
      for (const existing of listed.value) {
        if (!records.some((r) => r.providerId === existing.providerId)) {
          records.push(existing);
        }
      }
    }

    const snapshotResult = this.buildSnapshot(records);
    if (!snapshotResult.ok) return snapshotResult;
    this.lastSnapshot = snapshotResult.value;

    return success({
      resultId: asMeshResultId(this.createId("mesh_result")),
      requestId: request.requestId,
      request,
      snapshot: snapshotResult.value,
      eventsProcessed: request.events.length,
      providersTracked: records.length,
      durationMs: Math.max(0, this.clockMs() - start),
      createdAt: this.nowIso(),
    });
  }

  async snapshot(): Promise<Result<ProviderMeshSnapshot>> {
    if (this.lastSnapshot) return success(this.lastSnapshot);
    const listed = this.deps.registry.list();
    if (!listed.ok) return listed;
    if (listed.value.length === 0) {
      return failure(new ValidationError("no provider mesh snapshot available"));
    }
    return this.buildSnapshot(listed.value);
  }

  private buildSnapshot(
    records: readonly ProviderOperationalRecord[]
  ): Result<ProviderMeshSnapshot> {
    const topology = this.deps.topology.build(records);
    if (!topology.ok) return topology;

    const routingHints = this.deps.routingHints.build(records);
    if (!routingHints.ok) return routingHints;

    const failoverChains = this.deps.failover.plan(records);
    if (!failoverChains.ok) return failoverChains;

    const canaryPlans = this.deps.canary.plan(records);
    if (!canaryPlans.ok) return canaryPlans;

    const shadowRecommendations = this.deps.shadow.plan(records);
    if (!shadowRecommendations.ok) return shadowRecommendations;

    const capacityReports = this.deps.capacity.report(records);
    if (!capacityReports.ok) return capacityReports;

    return success({
      snapshotId: asProviderMeshSnapshotId(this.createId("mesh_snap")),
      providers: records,
      topology: topology.value,
      routingHints: routingHints.value,
      failoverChains: failoverChains.value,
      canaryPlans: canaryPlans.value,
      shadowRecommendations: shadowRecommendations.value,
      capacityReports: capacityReports.value,
      capturedAt: this.nowIso(),
      version: PROVIDER_MESH_VERSION,
    });
  }

  private validate(request: ProviderMeshRequest): ValidationError | undefined {
    if (!request.requestId?.trim()) {
      return new ValidationError("requestId is required");
    }
    if (!request.events || request.events.length === 0) {
      return new ValidationError("at least one provider mesh event is required");
    }
    for (const e of request.events) {
      if (!e.providerId?.trim()) {
        return new ValidationError("each event requires providerId");
      }
      if (!e.eventId?.trim()) {
        return new ValidationError("each event requires eventId");
      }
    }
    return undefined;
  }
}

function groupEvents(
  events: readonly ProviderMeshEvent[],
  filterIds?: readonly string[]
): Map<string, ProviderMeshEvent[]> {
  const allow = filterIds && filterIds.length > 0 ? new Set(filterIds) : undefined;
  const map = new Map<string, ProviderMeshEvent[]>();
  for (const e of events) {
    if (allow && !allow.has(e.providerId)) continue;
    const list = map.get(e.providerId) ?? [];
    list.push(e);
    map.set(e.providerId, list);
  }
  return map;
}
