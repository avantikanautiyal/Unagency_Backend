/**
 * Requested model identity survives provider fallback (exec_172 shape):
 * requested/selected = provider.openai/gpt-image-2.5-sunburst (routed, no
 * client pin), actual = provider.google/gemini-3-pro-image, fallback=quota.
 */

import assert from "node:assert/strict";
import { resolveTraceRequestedIdentity } from "../../../src/platform/api/services/execution-create-prepass";
import {
  beginExecutionTrace,
  buildExecutionTraceSummary,
  getExecutionTrace,
  resetExecutionTracesForTests,
  updateExecutionTrace,
} from "../../../src/platform/os/observability/execution-trace";
import {
  buildProductionExecutionIntegrity,
  mergeProviderIdentityFromTrace,
  resolveActualProviderIdentity,
} from "../../../src/platform/os/observability/production-execution-integrity";

const ROUTED = {
  preferredProviderId: "provider.openai",
  preferredModelId: "gpt-image-2.5-sunburst",
};

describe("requested model accounting under fallback", () => {
  beforeEach(() => resetExecutionTracesForTests());

  it("no client pin → requested = routed/declared model", () => {
    assert.deepEqual(resolveTraceRequestedIdentity({}, ROUTED), {
      requestedProviderId: "provider.openai",
      requestedModelId: "gpt-image-2.5-sunburst",
    });
  });

  it("client pin wins over routed model", () => {
    assert.deepEqual(
      resolveTraceRequestedIdentity(
        { providerId: "provider.google", modelId: "gemini-3-pro-image" },
        ROUTED,
      ),
      { requestedProviderId: "provider.google", requestedModelId: "gemini-3-pro-image" },
    );
  });

  it("trace → integrity preserves requested/selected/actual/fallback", () => {
    const executionId = "exec_acct_1";
    beginExecutionTrace({
      requestId: "corr",
      executionId,
      correlationId: "corr",
      ...resolveTraceRequestedIdentity({}, ROUTED),
    });
    updateExecutionTrace({
      executionId,
      patch: {
        selectedProviderId: "provider.openai",
        selectedModelId: "gpt-image-2.5-sunburst",
        actualProviderId: "provider.google",
        actualModelId: "gemini-3-pro-image",
        fallbackUsed: true,
        fallbackReason: "quota",
      },
    });
    const trace = getExecutionTrace(executionId)!;
    const summary = buildExecutionTraceSummary(trace);
    assert.match(summary, /requestedModel=provider\.openai\/gpt-image-2\.5-sunburst/);
    assert.doesNotMatch(summary, /requestedModel=unknown/);

    const identity = mergeProviderIdentityFromTrace(
      trace,
      resolveActualProviderIdentity({
        actualProviderId: "provider.google",
        actualModelId: "gemini-3-pro-image",
        fallbackUsed: true,
        fallbackReason: "quota",
      }),
    );
    const r = buildProductionExecutionIntegrity({
      executionId,
      correlationId: "corr",
      outputKind: "image",
      capabilityId: "image.generate",
      providerIdentity: identity,
      providerSuccess: true,
      metadata: {},
      allowMissingArtifacts: true,
    });
    assert.equal(r.requestedProvider, "provider.openai");
    assert.equal(r.requestedModel, "gpt-image-2.5-sunburst");
    assert.equal(r.selectedModel, "gpt-image-2.5-sunburst");
    assert.equal(r.actualProvider, "provider.google");
    assert.equal(r.actualModel, "gemini-3-pro-image");
    assert.equal(r.fallbackUsed, true);
    assert.equal(r.fallbackReason, "quota");
  });
});
