/**
 * DirectExecutionEngine winner identity — same semantics as FailoverOrchestrator.wrapOutcome.
 * finalProviderId / finalModelId always from the winning candidate; never cross-vendor.
 */

import assert from "node:assert/strict";
import { ProviderError } from "../../../src/platform/core/errors";
import { asOrganizationId } from "../../../src/platform/core/identifiers";
import { failure, success, type Result } from "../../../src/platform/core/result";
import {
  createDirectExecutionEngine,
  stampDirectWinnerIdentity,
} from "../../../src/platform/direct/direct-execution-engine";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../../src/platform/providers/runtime/contracts/provider-execution-response";
import { EMPTY_EXECUTION_STATISTICS } from "../../../src/platform/providers/runtime/contracts/provider-execution-metadata";
import { createProviderRuntime } from "../../../src/platform/providers/runtime/factories/create-provider-runtime";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import type { CancellationToken } from "../../../src/platform/providers/runtime/contracts/cancellation";
import { buildIntegrationJobSummary } from "../../../src/platform/infrastructure/execution/workers/integration-job-summary";
import {
  buildProductionExecutionIntegrity,
  resolveActualProviderIdentity,
} from "../../../src/platform/os/observability/production-execution-integrity";

type ScriptStep =
  | { readonly kind: "image_ok" }
  | { readonly kind: "http_error"; readonly message: string };

class ScriptedDispatcher extends ControllableDispatcher {
  readonly captured: { providerId: string; modelId: string }[] = [];
  private stepIndex = 0;

  constructor(private readonly steps: readonly ScriptStep[]) {
    super({ mode: "success" });
  }

  override async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken,
  ): Promise<Result<ProviderExecutionResponse>> {
    this.captured.push({
      providerId: String(request.providerId),
      modelId: String(request.modelId ?? ""),
    });
    const step = this.steps[this.stepIndex] ?? this.steps[this.steps.length - 1]!;
    this.stepIndex += 1;

    if (step.kind === "http_error") {
      return failure(
        new ProviderError(step.message, { requestId: request.requestId }),
      );
    }

    return success({
      requestId: request.requestId,
      providerId: request.providerId,
      output: {
        outputs: [
          {
            mimeType: "image/png",
            dataBase64: "iVBORw0KGgo=",
          },
        ],
      },
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      streamed: false,
      finishedAt: new Date().toISOString(),
    });
  }
}

async function runImageFailover(input: {
  readonly steps: readonly ScriptStep[];
  readonly preferredProviderId: string;
  readonly preferredModelId: string;
  readonly failoverChain: readonly { providerId: string; modelId: string }[];
}) {
  const dispatcher = new ScriptedDispatcher(input.steps);
  const runtime = createProviderRuntime({ dispatcher });
  const engine = createDirectExecutionEngine({ runtime });
  const report = await engine.run({
    requestId: `req_winner_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    rawPrompt: "Generate a product hero image.",
    organizationId: asOrganizationId("org_winner_identity"),
    correlationId: `corr_winner_${Date.now()}`,
    metadata: {
      capabilityId: "image.generate",
      productAction: "direct_passthrough",
      directPassthrough: true,
      preferredProviderId: input.preferredProviderId,
      preferredModelId: input.preferredModelId,
      imageFailoverChain: input.failoverChain,
      failoverChain: input.failoverChain,
    },
  });
  assert.equal(report.ok, true);
  return { report: report.value, dispatcher };
}

describe("DirectExecutionEngine winner identity", () => {
  const primary = {
    providerId: "provider.openai",
    modelId: "gpt-image-2",
  };
  const secondary = {
    providerId: "provider.google",
    modelId: "gemini-3-pro-image",
  };
  const tertiary = {
    providerId: "provider.ideogram",
    modelId: "ideogram-v3",
  };

  it("A — primary succeeds → final* matches primary", async () => {
    const { report, dispatcher } = await runImageFailover({
      steps: [{ kind: "image_ok" }],
      preferredProviderId: primary.providerId,
      preferredModelId: primary.modelId,
      failoverChain: [secondary],
    });
    assert.equal(report.success, true);
    assert.equal(dispatcher.captured.length, 1);
    const runtime = report.artifacts.runtime!;
    assert.equal(runtime.finalProviderId, primary.providerId);
    assert.equal(runtime.finalModelId, primary.modelId);
    assert.equal(runtime.failoverCount, 0);
    assert.equal(runtime.attemptHistory?.length, 1);
    assert.equal(runtime.attemptHistory?.[0]?.success, true);
  });

  it("B — primary fails, secondary succeeds → final* is Google winner", async () => {
    const { report, dispatcher } = await runImageFailover({
      steps: [
        { kind: "http_error", message: "OpenAI HTTP 429" },
        { kind: "image_ok" },
      ],
      preferredProviderId: primary.providerId,
      preferredModelId: primary.modelId,
      failoverChain: [secondary],
    });
    assert.equal(report.success, true);
    assert.ok(dispatcher.captured.length >= 2);
    const runtime = report.artifacts.runtime!;
    assert.equal(runtime.finalProviderId, secondary.providerId);
    assert.equal(runtime.finalModelId, secondary.modelId);
    assert.ok((runtime.failoverCount ?? 0) >= 1);
    // Never cross vendors: Google + gpt-image-2
    assert.notEqual(
      `${runtime.finalProviderId}/${runtime.finalModelId}`,
      `${secondary.providerId}/${primary.modelId}`,
    );
  });

  it("C — multiple failures then winner", async () => {
    const { report } = await runImageFailover({
      steps: [
        { kind: "http_error", message: "OpenAI HTTP 429" },
        { kind: "http_error", message: "Google HTTP 503" },
        { kind: "image_ok" },
      ],
      preferredProviderId: primary.providerId,
      preferredModelId: primary.modelId,
      failoverChain: [secondary, tertiary],
    });
    assert.equal(report.success, true);
    const runtime = report.artifacts.runtime!;
    assert.equal(runtime.finalProviderId, tertiary.providerId);
    assert.equal(runtime.finalModelId, tertiary.modelId);
    assert.ok((runtime.attemptHistory?.length ?? 0) >= 3);
    assert.ok((runtime.failoverCount ?? 0) >= 1);
  });

  it("D — provider/model IDs never cross vendors", () => {
    const stamped = stampDirectWinnerIdentity({
      result: {
        requestId: "r1",
        sessionId: "s1",
        status: "succeeded",
        success: true,
        statistics: { ...EMPTY_EXECUTION_STATISTICS, totalMs: 1, dispatchMs: 1 },
        completedAt: new Date().toISOString(),
        response: {
          requestId: "r1",
          providerId: "provider.google" as never,
          output: {},
          streamed: false,
          finishedAt: new Date().toISOString(),
        },
      },
      attemptHistory: [
        {
          attemptId: "a0",
          positionInRoute: 0,
          primaryOrFailover: "primary",
          providerId: primary.providerId,
          modelId: primary.modelId,
          success: false,
          failureCategory: "rate_limit",
          latencyMs: 10,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          status: "failed",
        },
        {
          attemptId: "a1",
          positionInRoute: 1,
          primaryOrFailover: "failover",
          providerId: secondary.providerId,
          modelId: secondary.modelId,
          success: true,
          failureCategory: "none",
          latencyMs: 20,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          status: "succeeded",
        },
      ],
      winner: secondary,
    });
    assert.equal(stamped.finalProviderId, "provider.google");
    assert.equal(stamped.finalModelId, "gemini-3-pro-image");
    assert.notEqual(stamped.finalModelId, "gpt-image-2");
  });

  it("E — fallbackUsed and failoverCount are correct", async () => {
    const { report } = await runImageFailover({
      steps: [
        { kind: "http_error", message: "OpenAI HTTP 429" },
        { kind: "image_ok" },
      ],
      preferredProviderId: primary.providerId,
      preferredModelId: primary.modelId,
      failoverChain: [secondary],
    });
    const runtime = report.artifacts.runtime!;
    assert.ok((runtime.failoverCount ?? 0) >= 1);
    const summary = buildIntegrationJobSummary({
      report,
      durationMs: 100,
      executionMode: "live",
    });
    assert.equal(summary.fallbackUsed, true);
    assert.equal(summary.actualProviderId, secondary.providerId);
    assert.equal(summary.actualModelId, secondary.modelId);
    assert.ok((summary.failoverCount as number) >= 1);
  });

  it("F — job summary uses actual winner, not routed primary", async () => {
    const { report } = await runImageFailover({
      steps: [
        { kind: "http_error", message: "OpenAI HTTP 429" },
        { kind: "image_ok" },
      ],
      preferredProviderId: primary.providerId,
      preferredModelId: primary.modelId,
      failoverChain: [secondary],
    });
    const summary = buildIntegrationJobSummary({
      report,
      durationMs: 100,
      executionMode: "live",
    });
    assert.equal(summary.actualProviderId, secondary.providerId);
    assert.equal(summary.actualModelId, secondary.modelId);
    assert.notEqual(summary.actualModelId, primary.modelId);
    // routed may still be primary — that is selection, not actual
    if (summary.routedModelId) {
      assert.notEqual(summary.actualModelId, summary.routedModelId);
    }
  });

  it("G — integrity/evidence use actual winner", async () => {
    const { report } = await runImageFailover({
      steps: [
        { kind: "http_error", message: "OpenAI HTTP 429" },
        { kind: "image_ok" },
      ],
      preferredProviderId: primary.providerId,
      preferredModelId: primary.modelId,
      failoverChain: [secondary],
    });
    const summary = buildIntegrationJobSummary({
      report,
      durationMs: 100,
      executionMode: "live",
    });
    const identity = resolveActualProviderIdentity(summary as Record<string, unknown>);
    assert.equal(identity.actualProviderId, secondary.providerId);
    assert.equal(identity.actualModelId, secondary.modelId);
    assert.equal(identity.fallbackUsed, true);

    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_winner_g",
      correlationId: "corr_winner_g",
      service: "social-media",
      subtype: "output",
      outputKind: "image",
      providerIdentity: {
        ...identity,
        selectedProviderId: primary.providerId,
        selectedModelId: primary.modelId,
        requestedProviderId: primary.providerId,
        requestedModelId: primary.modelId,
      },
      allowMissingArtifacts: true,
      providerSuccess: true,
    });
    assert.equal(integrity.actualProvider, secondary.providerId);
    assert.equal(integrity.actualModel, secondary.modelId);
    assert.equal(integrity.fallbackUsed, true);
    assert.notEqual(integrity.actualModel, primary.modelId);
  });

  it("no serviceId-specific branches in stamp helper module surface", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/direct/direct-execution-engine.ts",
      ),
      "utf8",
    );
    const stampFn = src.slice(
      src.indexOf("export function stampDirectWinnerIdentity"),
      src.indexOf("function classifyDirectAttemptFailure"),
    );
    assert.equal(/serviceId\s*===/.test(stampFn), false);
    assert.equal(/social-media/.test(stampFn), false);
  });
});
