/**
 * A bad request (non-image file, invalid parameter) must not open the
 * circuit breaker for everyone, and one model's outage must not block the
 * provider's other models.
 */

import assert from "node:assert/strict";
import { ProviderError } from "../../../../src/platform/core/errors";
import {
  asCapabilityId,
  asOrganizationId,
  asProviderId,
} from "../../../../src/platform/core/identifiers";
import { failure, type Result } from "../../../../src/platform/core/result";
import {
  allProvidersCoolingDownMessage,
  createDirectExecutionEngine,
  isReferenceFileRejection,
  REFERENCE_FILE_REJECTED_MESSAGE,
  userFacingProviderFailureMessage,
} from "../../../../src/platform/direct/direct-execution-engine";
import type { CancellationToken } from "../../../../src/platform/providers/runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../../../src/platform/providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../../../src/platform/providers/runtime/contracts/provider-execution-response";
import { isCallerInputFailureForCircuit } from "../../../../src/platform/providers/runtime/execution/execution-pipeline";
import { createProviderRuntime } from "../../../../src/platform/providers/runtime/factories/create-provider-runtime";
import {
  ControllableDispatcher,
  sampleRequest,
} from "../../../../src/platform/providers/runtime/testing";

const ZIP_400 =
  "OpenAI HTTP 400: Invalid 'images[0].image_url'. Expected a base64-encoded data URL with an image MIME type (e.g. 'data:image/png;base64,aW1nIGJ5dGVzIGhlcmU='), but got unsupported MIME type 'application/x-zip-compressed'.";
const GOOGLE_ZIP_400 = "google HTTP 400: Unsupported MIME type: application/x-zip-compressed";

class FailingDispatcher extends ControllableDispatcher {
  calls = 0;
  constructor(private readonly message: string, private readonly status: number) {
    super({ mode: "success" });
  }
  override async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken,
  ): Promise<Result<ProviderExecutionResponse>> {
    this.calls += 1;
    return failure(
      new ProviderError(this.message, {
        requestId: request.requestId,
        status: this.status,
        httpStatus: this.status,
      }),
    );
  }
}

function imageRequest(id: string, modelId: string) {
  return {
    ...sampleRequest({ requestId: id, providerId: "provider.openai" }),
    providerId: asProviderId("provider.openai"),
    capabilityId: asCapabilityId("image.generate"),
    modelId,
  };
}

const TRIP_FAST = { failureThreshold: 2, successThreshold: 1, resetTimeoutMs: 30_000 };

describe("circuit breaker — caller-input failures and per-model scope", () => {
  it("HTTP 400 for a non-image reference never opens the breaker", async () => {
    const dispatcher = new FailingDispatcher(ZIP_400, 400);
    const runtime = createProviderRuntime({ dispatcher, circuitBreakerConfig: TRIP_FAST });
    for (let i = 0; i < 6; i++) {
      await runtime.execute(imageRequest(`zip_${i}`, "gpt-image-1"));
    }
    assert.equal(dispatcher.calls, 6);
    assert.equal(runtime.canDispatchToProvider("provider.openai", "gpt-image-1"), true);
    assert.equal(runtime.canDispatchToProvider("provider.openai"), true);
  });

  it("Google's unsupported-MIME 400 (no status on the error) is caller input too", async () => {
    const dispatcher = new FailingDispatcher(GOOGLE_ZIP_400, 0);
    const runtime = createProviderRuntime({ dispatcher, circuitBreakerConfig: TRIP_FAST });
    for (let i = 0; i < 4; i++) {
      await runtime.execute(imageRequest(`g_${i}`, "gemini-3.1-flash-image"));
    }
    assert.equal(runtime.canDispatchToProvider("provider.openai", "gemini-3.1-flash-image"), true);
  });

  it("real outages (5xx) still open the breaker", async () => {
    const dispatcher = new FailingDispatcher("HTTP 500 upstream error", 500);
    const runtime = createProviderRuntime({ dispatcher, circuitBreakerConfig: TRIP_FAST });
    await runtime.execute(imageRequest("o1", "gpt-image-1"));
    await runtime.execute(imageRequest("o2", "gpt-image-1"));
    assert.equal(runtime.canDispatchToProvider("provider.openai", "gpt-image-1"), false);
  });

  it("one model's open breaker does not block the provider's other models", async () => {
    const dispatcher = new FailingDispatcher("HTTP 500 upstream error", 500);
    const runtime = createProviderRuntime({ dispatcher, circuitBreakerConfig: TRIP_FAST });
    await runtime.execute(imageRequest("m1", "gpt-image-1"));
    await runtime.execute(imageRequest("m2", "gpt-image-1"));
    assert.equal(runtime.canDispatchToProvider("provider.openai", "gpt-image-1"), false);
    assert.equal(runtime.canDispatchToProvider("provider.openai", "gpt-5.5"), true);
    // Model-agnostic callers still see the provider as degraded.
    assert.equal(runtime.canDispatchToProvider("provider.openai"), false);
    const snaps = runtime.getProviderHealthSnapshots();
    assert.ok(snaps.some((s) => s.model === "gpt-image-1" && s.circuitState === "open"));
  });

  it("classifies caller-input failures for the breaker", () => {
    assert.equal(isCallerInputFailureForCircuit({ failureCategory: "invalid_request" }), true);
    assert.equal(isCallerInputFailureForCircuit({ failureCategory: "content_policy" }), true);
    assert.equal(isCallerInputFailureForCircuit({ failureCategory: "unknown", httpStatus: 422 }), true);
    assert.equal(isCallerInputFailureForCircuit({ failureCategory: "unknown", message: "google http 400: bad" }), true);
    assert.equal(isCallerInputFailureForCircuit({ failureCategory: "authentication", httpStatus: 400 }), false);
    assert.equal(isCallerInputFailureForCircuit({ failureCategory: "timeout", httpStatus: 408 }), false);
    assert.equal(isCallerInputFailureForCircuit({ failureCategory: "http_5xx", httpStatus: 503 }), false);
    assert.equal(isCallerInputFailureForCircuit({ failureCategory: "unknown", httpStatus: 401 }), false);
  });
});

describe("user-facing messages", () => {
  it("recognises non-image reference rejections only", () => {
    assert.equal(isReferenceFileRejection(ZIP_400), true);
    assert.equal(isReferenceFileRejection(GOOGLE_ZIP_400), true);
    assert.equal(
      isReferenceFileRejection(
        "OpenAI HTTP 400: Invalid 'images[0].image_url'. Expected a base64-encoded data URL with an image MIME type, but got unsupported MIME type 'application/pdf'.",
      ),
      true,
    );
    assert.equal(isReferenceFileRejection("google HTTP 400: Unsupported MIME type: image/heic"), false);
    assert.equal(isReferenceFileRejection("OpenAI HTTP 400: prompt too long"), false);
  });

  it("replaces the raw vendor 400 with plain wording", () => {
    const msg = userFacingProviderFailureMessage({
      category: "unknown",
      candidateCount: 3,
      originalMessage: ZIP_400,
    });
    assert.equal(msg, REFERENCE_FILE_REJECTED_MESSAGE);
  });

  it("states the real wait when every provider is cooling down", () => {
    assert.match(allProvidersCoolingDownMessage(12_000), /^All eligible AI providers are temporarily unavailable\. Please retry in about 15 seconds\.$/);
    assert.match(allProvidersCoolingDownMessage(), /about 30 seconds/);
    assert.match(allProvidersCoolingDownMessage(1_000), /about 5 seconds/);
  });
});

describe("failover stops on a non-image reference", () => {
  it("does not repeat the same rejected file on every engine", async () => {
    const dispatcher = new FailingDispatcher(ZIP_400, 400);
    const runtime = createProviderRuntime({ dispatcher, circuitBreakerConfig: TRIP_FAST });
    const engine = createDirectExecutionEngine({ runtime });
    const run = await engine.run({
      requestId: "req_zip_ref",
      rawPrompt: "Write a tagline",
      organizationId: asOrganizationId("org_zip"),
      correlationId: "corr_zip",
      metadata: {
        capabilityId: "text.generate",
        productAction: "direct_passthrough",
        directPassthrough: true,
        preferredProviderId: "provider.openai",
        preferredModelId: "gpt-5.5",
        failoverChain: [
          { providerId: "provider.anthropic", modelId: "claude-sonnet-4-6" },
          { providerId: "provider.gemini", modelId: "gemini-pro-latest" },
        ],
      },
    });
    assert.equal(run.ok, true);
    assert.equal(run.value.success, false);
    assert.equal(dispatcher.calls, 1);
    const failed = run.value.trace.stages.find((st) => st.status === "failed");
    assert.equal(failed?.message, REFERENCE_FILE_REJECTED_MESSAGE);
  });
});
