/**
 * Routing contract through the real DirectExecutionEngine candidate loop:
 * - preferred provider (default) → declared failover may substitute a provider
 * - required provider pin → never substitutes another provider
 * - one authoritative actual model: the executed (remapped) model, consistently
 *   across dispatch, attempt history, winner, job summary and integrity.
 */

import assert from "node:assert/strict";
import { ProviderError } from "../../../src/platform/core/errors";
import { asOrganizationId } from "../../../src/platform/core/identifiers";
import { failure, success, type Result } from "../../../src/platform/core/result";
import { createDirectExecutionEngine } from "../../../src/platform/direct/direct-execution-engine";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../../src/platform/providers/runtime/contracts/provider-execution-response";
import { createProviderRuntime } from "../../../src/platform/providers/runtime/factories/create-provider-runtime";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import type { CancellationToken } from "../../../src/platform/providers/runtime/contracts/cancellation";
import { buildIntegrationJobSummary } from "../../../src/platform/infrastructure/execution/workers/integration-job-summary";
import {
  buildProductionExecutionIntegrity,
  resolveActualProviderIdentity,
} from "../../../src/platform/os/observability/production-execution-integrity";
import {
  applyProviderPinPolicy,
  parseProviderPinPolicy,
  providerPinMetadataStamps,
} from "../../../src/platform/providers/routing/provider-pin-policy";

type Step = "ok" | "fail";

class ScriptedDispatcher extends ControllableDispatcher {
  readonly captured: { providerId: string; modelId: string }[] = [];
  private i = 0;
  constructor(
    private readonly steps: readonly Step[],
    private readonly kind: "image" | "text",
  ) {
    super({ mode: "success" });
  }
  override async dispatch(
    request: ProviderExecutionRequest,
    _t: CancellationToken,
  ): Promise<Result<ProviderExecutionResponse>> {
    this.captured.push({ providerId: String(request.providerId), modelId: String(request.modelId ?? "") });
    const step = this.steps[this.i] ?? this.steps[this.steps.length - 1]!;
    this.i += 1;
    if (step === "fail") {
      return failure(new ProviderError("HTTP 401 invalid_api_key", { requestId: request.requestId, status: 401 }));
    }
    return success({
      requestId: request.requestId,
      providerId: request.providerId,
      output:
        this.kind === "image"
          ? { outputs: [{ mimeType: "image/png", dataBase64: "iVBORw0KGgo=" }] }
          : { content: "Approved copy." },
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      streamed: false,
      finishedAt: new Date().toISOString(),
    });
  }
}

async function run(input: {
  kind: "image" | "text";
  steps: readonly Step[];
  primary: { providerId: string; modelId: string };
  chain: readonly { providerId: string; modelId: string }[];
  pin?: "preferred" | "required";
  pinnedProviderId?: string;
  extraMetadata?: Record<string, unknown>;
}) {
  const dispatcher = new ScriptedDispatcher(input.steps, input.kind);
  const engine = createDirectExecutionEngine({ runtime: createProviderRuntime({ dispatcher }) });
  const report = await engine.run({
    requestId: `req_pin_${Math.random().toString(36).slice(2, 9)}`,
    rawPrompt: input.kind === "image" ? "Generate a product hero image." : "Write one sentence.",
    organizationId: asOrganizationId("org_pin"),
    correlationId: "corr_pin",
    metadata: {
      capabilityId: input.kind === "image" ? "image.generate" : "text.generate",
      productAction: "direct_passthrough",
      directPassthrough: true,
      preferredProviderId: input.primary.providerId,
      preferredModelId: input.primary.modelId,
      ...(input.kind === "image" ? { imageFailoverChain: input.chain } : {}),
      failoverChain: input.chain,
      ...(input.extraMetadata ?? {}),
      ...providerPinMetadataStamps({
        policy: parseProviderPinPolicy(input.pin),
        pinnedProviderId: input.pinnedProviderId ?? input.primary.providerId,
      }),
    },
  });
  return { report, dispatcher };
}

const OPENAI = { providerId: "provider.openai", modelId: "gpt-image-2" };
const OPENAI_ALT = { providerId: "provider.openai", modelId: "gpt-image-1.5" };
const GOOGLE = { providerId: "provider.google", modelId: "gemini-3-pro-image" };

describe("provider pin policy (contract helpers)", () => {
  it("default policy is preferred; only an explicit 'required' pins", () => {
    assert.equal(parseProviderPinPolicy(undefined), "preferred");
    assert.equal(parseProviderPinPolicy("anything"), "preferred");
    assert.equal(parseProviderPinPolicy("required"), "required");
    assert.deepEqual(providerPinMetadataStamps({ policy: "preferred", pinnedProviderId: "provider.x" }), {});
  });
  it("required pin keeps only the pinned provider's candidates, order preserved", () => {
    const r = applyProviderPinPolicy([OPENAI, GOOGLE, OPENAI_ALT], {
      providerPinPolicy: "required",
      pinnedProviderId: "provider.openai",
    });
    assert.deepEqual(r.candidates, [OPENAI, OPENAI_ALT]);
    assert.deepEqual(r.removed, [GOOGLE]);
  });
});

describe("DirectExecutionEngine — preferred vs required provider", () => {
  it("preferred provider → declared cross-provider fallback allowed, identity preserved", async () => {
    const { report, dispatcher } = await run({ kind: "image", steps: ["fail", "ok"], primary: OPENAI, chain: [GOOGLE] });
    assert.equal(report.ok, true);
    if (!report.ok) return;
    assert.equal(report.value.success, true);
    assert.deepEqual(dispatcher.captured.map((c) => c.providerId), ["provider.openai", "provider.google"]);
    const summary = buildIntegrationJobSummary({ report: report.value, durationMs: 1, executionMode: "live" });
    const identity = resolveActualProviderIdentity(summary as Record<string, unknown>);
    const integrity = buildProductionExecutionIntegrity({
      executionId: "e1",
      correlationId: "c",
      outputKind: "image",
      providerIdentity: { ...identity, requestedProviderId: OPENAI.providerId, requestedModelId: OPENAI.modelId, selectedProviderId: OPENAI.providerId, selectedModelId: OPENAI.modelId },
      providerSuccess: true,
      allowMissingArtifacts: true,
    });
    assert.equal(integrity.requestedModel, OPENAI.modelId);
    assert.equal(integrity.selectedModel, OPENAI.modelId);
    assert.equal(integrity.actualProvider, GOOGLE.providerId);
    assert.equal(integrity.actualModel, GOOGLE.modelId);
    assert.equal(integrity.fallbackUsed, true);
  });

  it("required pin → pinned provider failure is final; no provider substitution", async () => {
    const { report, dispatcher } = await run({ kind: "image", steps: ["fail", "ok"], primary: OPENAI, chain: [GOOGLE], pin: "required" });
    assert.ok(dispatcher.captured.every((c) => c.providerId === "provider.openai"));
    assert.ok(!dispatcher.captured.some((c) => c.providerId === "provider.google"));
    const succeeded = report.ok && report.value.success === true;
    assert.equal(succeeded, false);
  });

  it("required pin → same-provider model alternate is still allowed", async () => {
    const { report, dispatcher } = await run({ kind: "image", steps: ["fail", "ok"], primary: OPENAI, chain: [GOOGLE, OPENAI_ALT], pin: "required" });
    assert.equal(report.ok, true);
    if (!report.ok) return;
    assert.equal(report.value.success, true);
    assert.deepEqual(dispatcher.captured.map((c) => c.providerId), ["provider.openai", "provider.openai"]);
    assert.equal(report.value.artifacts.runtime?.finalProviderId, "provider.openai");
    assert.equal(report.value.artifacts.runtime?.finalModelId, OPENAI_ALT.modelId);
  });

  it("required pin on a provider routing did not select → explicit failure, zero dispatches", async () => {
    const { report, dispatcher } = await run({ kind: "image", steps: ["ok"], primary: OPENAI, chain: [GOOGLE], pin: "required", pinnedProviderId: "provider.meta" });
    assert.equal(dispatcher.captured.length, 0);
    assert.equal(report.ok, false);
    if (report.ok) return;
    assert.match(report.error.message, /Required provider pin 'provider\.meta'/);
    assert.equal((report.error as { metadata?: Record<string, unknown> }).metadata?.reason, "provider_pin_unavailable");
  });
});

describe("one authoritative actual model identity", () => {
  const META = { providerId: "provider.meta", modelId: "Llama-4-Maverick-17B-128E-Instruct-FP8" };
  const ANTHROPIC_ROUTED = { providerId: "provider.anthropic", modelId: "claude-opus-4-1" };

  it("remapped fallback model is the same actual model in dispatch, history, winner, summary, integrity", async () => {
    const { report, dispatcher } = await run({ kind: "text", steps: ["fail", "ok"], primary: META, chain: [ANTHROPIC_ROUTED] });
    assert.equal(report.ok, true);
    if (!report.ok) return;
    assert.equal(report.value.success, true);
    const wire = dispatcher.captured[1]!.modelId.split("/").pop();
    const runtime = report.value.artifacts.runtime!;
    const winnerAttempt = runtime.attemptHistory?.find((a) => a.success);
    const summary = buildIntegrationJobSummary({ report: report.value, durationMs: 1, executionMode: "live" });
    const identity = resolveActualProviderIdentity(summary as Record<string, unknown>);

    assert.equal(wire, "claude-opus-4-6");
    assert.equal(runtime.finalModelId, wire);
    assert.equal(winnerAttempt?.modelId, wire);
    assert.equal(summary.actualModelId, wire);
    assert.equal(identity.actualModelId, wire);
    assert.equal(identity.fallbackUsed, true);
    // Requested/selected stay the routed primary — never overwritten by actual.
    const integrity = buildProductionExecutionIntegrity({
      executionId: "e2",
      correlationId: "c",
      outputKind: "text",
      providerIdentity: { ...identity, requestedProviderId: META.providerId, requestedModelId: META.modelId, selectedProviderId: META.providerId, selectedModelId: META.modelId },
      providerSuccess: true,
      allowMissingArtifacts: true,
    });
    assert.equal(integrity.requestedModel, META.modelId);
    assert.equal(integrity.selectedModel, META.modelId);
    assert.equal(integrity.actualModel, wire);
  });

  it("non-remapped models keep their identity unchanged", async () => {
    const { report } = await run({ kind: "image", steps: ["ok"], primary: GOOGLE, chain: [] });
    assert.equal(report.ok, true);
    if (!report.ok) return;
    assert.equal(report.value.artifacts.runtime?.finalModelId, GOOGLE.modelId);
  });
});

describe("provider failure is never reported as a missing deliverable", () => {
  it("required pin failure on a document job → provider failure message, not DocumentPlan", async () => {
    const { report } = await run({
      kind: "text",
      steps: ["fail"],
      primary: { providerId: "provider.meta", modelId: "Llama-4-Maverick-17B-128E-Instruct-FP8" },
      chain: [{ providerId: "provider.anthropic", modelId: "claude-opus-4-1" }],
      pin: "required",
      extraMetadata: { outputKind: "document" },
    });
    assert.equal(report.ok, true);
    if (!report.ok) return;
    assert.equal(report.value.success, false);
    const summary = buildIntegrationJobSummary({ report: report.value, durationMs: 1, executionMode: "live" });
    assert.ok(summary.errorMessage);
    assert.doesNotMatch(String(summary.errorMessage), /DocumentPlan/);
    assert.match(String(summary.errorMessage), /failed at |401|invalid_api_key|provider/i);
  });
});

