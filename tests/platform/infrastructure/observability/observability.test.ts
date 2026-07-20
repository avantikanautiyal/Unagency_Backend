import {
  setupObservability,
  samplePipelineEvents,
} from "../../../../src/platform/infrastructure/observability/testing";
import { ObservabilityEventBuilder } from "../../../../src/platform/infrastructure/observability/builders/observability-event-builder";
import { collectFromExecutionMetrics } from "../../../../src/platform/infrastructure/observability/analytics/collectors";
import { sanitizeLogMessage } from "../../../../src/platform/infrastructure/observability/logs/sanitize";
import { createIntelligenceOsIntegrationPlatform } from "../../../../src/platform/intelligence/integration/factories/create-intelligence-os-integration-platform";
import { sampleIntegrationRequest } from "../../../../src/platform/intelligence/integration/testing";
import { collectFromIntegrationReport } from "../../../../src/platform/infrastructure/observability/analytics/collectors";

describe("Production Observability & AIOps Platform", () => {
  it("traces a full pipeline via ingest", () => {
    const { engine, helpers } = setupObservability();
    const at = helpers.nowIso();
    const events = samplePipelineEvents(helpers.createId, at);
    const result = engine.ingestMany(events);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.accepted).toBe(events.length);

    const trace = engine.getTraceByCorrelation("corr_obs_1");
    expect(trace.ok).toBe(true);
    if (!trace.ok) return;
    expect(trace.value.length).toBeGreaterThanOrEqual(4);
    expect(trace.value.some((s) => s.surface === "provider")).toBe(true);
  });

  it("aggregates costs and tokens", () => {
    const { engine, helpers } = setupObservability();
    engine.ingestMany(samplePipelineEvents(helpers.createId, helpers.nowIso()));
    const costs = engine.costSummary({ organizationId: "org_1" });
    expect(costs.ok).toBe(true);
    if (!costs.ok) return;
    expect(costs.value.total).toBeGreaterThan(0);
    expect(costs.value.byProvider.openai).toBeGreaterThan(0);
    expect(costs.value.projectedMonthly).toBeGreaterThan(0);

    const tokens = engine.tokenSummary();
    expect(tokens.ok).toBe(true);
    if (!tokens.ok) return;
    expect(tokens.value.totalTokens).toBe(160);
    expect(tokens.value.promptTokens).toBe(100);
  });

  it("reports health and evaluates alerts", () => {
    const { engine, helpers } = setupObservability({ budgetLimit: 0.01 });
    engine.ingestMany(samplePipelineEvents(helpers.createId, helpers.nowIso()));
    // force high latency alert
    engine.ingest(
      ObservabilityEventBuilder.create()
        .withEventId(helpers.createId("evt"))
        .withSurface("provider")
        .withAt(helpers.nowIso())
        .withContext({
          correlationId: "corr_obs_1",
          traceId: "trace_obs_1",
        })
        .withSpan({
          name: "slow",
          durationMs: 60_000,
          startedAt: helpers.nowIso(),
          completedAt: helpers.nowIso(),
        })
        .addMetric("queue.depth", 500)
        .addMetric("execution.retries", 25)
        .build()
    );

    const health = engine.health();
    expect(health.ok).toBe(true);

    const alerts = engine.evaluateAlerts();
    expect(alerts.ok).toBe(true);
    if (!alerts.ok) return;
    expect(alerts.value.some((a) => a.kind === "latency")).toBe(true);
    expect(alerts.value.some((a) => a.kind === "queue_saturation")).toBe(true);
    expect(alerts.value.some((a) => a.kind === "retry_storm")).toBe(true);
  });

  it("builds dashboards and diagnostics", () => {
    const { engine, helpers } = setupObservability();
    engine.ingestMany(samplePipelineEvents(helpers.createId, helpers.nowIso()));
    const dash = engine.buildDashboard("executive");
    expect(dash.ok).toBe(true);
    if (!dash.ok) return;
    expect(dash.value.widgets.length).toBeGreaterThan(0);

    const ops = engine.buildDashboard("operations");
    expect(ops.ok).toBe(true);

    const diag = engine.diagnose("corr_obs_1");
    expect(diag.ok).toBe(true);
    if (!diag.ok) return;
    expect(diag.value.dependencyTimeline.length).toBeGreaterThan(0);
  });

  it("generates reports", () => {
    const { engine, helpers } = setupObservability();
    const at = helpers.nowIso();
    engine.ingestMany(samplePipelineEvents(helpers.createId, at));
    const report = engine.generateReport("daily", "2020-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.value.sections.length).toBeGreaterThan(0);

    const costReport = engine.generateReport("cost", "2020-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
    expect(costReport.ok).toBe(true);
  });

  it("applies retention and exports", () => {
    const { engine, helpers } = setupObservability();
    engine.ingestMany(samplePipelineEvents(helpers.createId, helpers.nowIso()));
    const exported = engine.exportData("traces");
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.value.itemCount).toBeGreaterThan(0);

    const purged = engine.applyRetention({
      class: "purge",
      maxAgeMs: 0,
      maxRecords: 1,
    });
    expect(purged.ok).toBe(true);
  });

  it("sanitizes secrets from log messages", () => {
    expect(sanitizeLogMessage("Bearer sk-abc123XYZ")).toContain("[REDACTED]");
  });

  it("collects from distributed execution metrics", () => {
    const { engine, helpers } = setupObservability();
    const event = collectFromExecutionMetrics(
      {
        queueLengths: {
          immediate: 2,
          scheduled: 0,
          priority: 1,
          streaming: 0,
          long_running: 0,
          retry: 0,
          dead_letter: 1,
          batch: 0,
        },
        workerUtilization: 0.95,
        retryCount: 3,
        failureRate: 0.1,
        averageExecutionMs: 120,
        averageQueueMs: 15,
        providerTimeMs: 90,
        throughputPerMinute: 10,
        cancellationRate: 0,
        deadLetterCount: 1,
        activeJobs: 2,
        capturedAt: helpers.nowIso(),
      },
      helpers.createId,
      { correlationId: "corr_exec" }
    );
    const ingested = engine.ingest(event);
    expect(ingested.ok).toBe(true);
    const metrics = engine.queryMetrics({ name: "worker.utilization" });
    expect(metrics.ok && metrics.value[0]?.value).toBe(0.95);
  });

  it("collects from Integration Layer reports additively", async () => {
    const { engine, helpers } = setupObservability();
    const integration = createIntelligenceOsIntegrationPlatform({
      createId: helpers.createId,
      nowIso: helpers.nowIso,
      clockMs: helpers.clockMs,
    });
    const report = await integration.engine.run(sampleIntegrationRequest());
    expect(report.ok).toBe(true);
    if (!report.ok) return;

    const events = collectFromIntegrationReport(report.value, helpers.createId);
    expect(events.length).toBeGreaterThan(0);
    const ingested = engine.ingestMany(events);
    expect(ingested.ok).toBe(true);

    const trace = engine.getTraceByCorrelation(report.value.trace.correlationId);
    expect(trace.ok).toBe(true);
    if (!trace.ok) return;
    expect(trace.value.length).toBeGreaterThan(0);

    const diag = engine.diagnose(report.value.trace.correlationId);
    expect(diag.ok).toBe(true);
  }, 120000);

  it("rejects events without correlation", () => {
    const { engine } = setupObservability();
    const bad = engine.ingest({
      eventId: "e1",
      surface: "api",
      at: new Date().toISOString(),
      context: { correlationId: "", traceId: "" },
    });
    expect(bad.ok).toBe(false);
  });
});
