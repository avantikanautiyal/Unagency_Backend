/**
 * Observability testing helpers.
 */

import {
  createObservabilityPlatform,
  type CreateObservabilityOptions,
  type ObservabilityPlatform,
} from "../factories/create-observability-platform";
import { ObservabilityEventBuilder } from "../builders/observability-event-builder";

export function deterministicHelpers() {
  let id = 0;
  let ms = 1_700_000_000_000;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => new Date(ms).toISOString(),
    clockMs: () => {
      ms += 5;
      return ms;
    },
  };
}

export function setupObservability(
  options: CreateObservabilityOptions = {}
): ObservabilityPlatform & { helpers: ReturnType<typeof deterministicHelpers> } {
  const helpers = deterministicHelpers();
  const platform = createObservabilityPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    budgetLimit: options.budgetLimit ?? 100,
    ...options,
  });
  return { ...platform, helpers };
}

export function samplePipelineEvents(createId: (p: string) => string, at: string) {
  const context = {
    correlationId: "corr_obs_1",
    traceId: "trace_obs_1",
    executionId: "exec_1",
    organizationId: "org_1",
    workspaceId: "ws_1",
    capabilityId: "marketing.copywriting",
    providerId: "openai",
    modelId: "gpt-test",
    department: "marketing",
  };

  return [
    ObservabilityEventBuilder.create()
      .withEventId(createId("evt"))
      .withSurface("api")
      .withAt(at)
      .withContext(context)
      .withSpan({
        name: "api.request",
        durationMs: 5,
        startedAt: at,
        completedAt: at,
      })
      .addMetric("api.requests", 1)
      .build(),
    ObservabilityEventBuilder.create()
      .withEventId(createId("evt"))
      .withSurface("queue")
      .withAt(at)
      .withContext(context)
      .withSpan({
        name: "queue.wait",
        durationMs: 20,
        startedAt: at,
        completedAt: at,
      })
      .addMetric("queue.depth", 3)
      .build(),
    ObservabilityEventBuilder.create()
      .withEventId(createId("evt"))
      .withSurface("worker")
      .withAt(at)
      .withContext(context)
      .withSpan({
        name: "worker.execute",
        durationMs: 100,
        startedAt: at,
        completedAt: at,
      })
      .addMetric("worker.utilization", 0.4)
      .build(),
    ObservabilityEventBuilder.create()
      .withEventId(createId("evt"))
      .withSurface("provider")
      .withAt(at)
      .withContext(context)
      .withSpan({
        name: "provider.invoke",
        durationMs: 80,
        startedAt: at,
        completedAt: at,
      })
      .withTokens({
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 10,
        streamingTokens: 0,
        toolTokens: 0,
        visionTokens: 0,
        audioTokens: 0,
        totalTokens: 160,
      })
      .withCost({ amount: 0.02, currency: "USD", providerId: "openai", modelId: "gpt-test", capabilityId: "marketing.copywriting", department: "marketing" })
      .withHealth({
        component: "openai",
        surface: "provider",
        status: "healthy",
      })
      .withLog("info", "provider completed")
      .build(),
    ObservabilityEventBuilder.create()
      .withEventId(createId("evt"))
      .withSurface("evaluation")
      .withAt(at)
      .withContext(context)
      .withSpan({
        name: "evaluation.score",
        durationMs: 15,
        startedAt: at,
        completedAt: at,
      })
      .addMetric("evaluation.score", 0.88, "score")
      .build(),
  ];
}
