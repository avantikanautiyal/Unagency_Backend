/**
 * Gemini sometimes answers an image request with text only. That reply used to
 * count as success ("[0 image(s)]"), so nothing failed over and the step ended
 * with canonical_artifact_missing.
 */

import { success, type Result } from "../../../../src/platform/core/result";
import { asCapabilityId, asProviderId } from "../../../../src/platform/core/identifiers";
import { GOOGLE_IMAGEN_SPEC } from "../../../../src/platform/providers/image/configs/verified-image-provider-specs";
import {
  NO_IMAGE_REPLY_MESSAGE,
  VendorSyncImageDispatcher,
} from "../../../../src/platform/providers/image/common/vendor-sync-image-dispatcher";
import type {
  IImageHttpClient,
  ImageHttpRequest,
  ImageHttpResponse,
} from "../../../../src/platform/providers/image/http/image-http-client";
import { sampleRequest } from "../../../../src/platform/providers/runtime/testing";
import { isCallerInputFailureForCircuit } from "../../../../src/platform/providers/runtime/execution/execution-pipeline";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

class FixedReplyClient implements IImageHttpClient {
  constructor(private readonly body: Record<string, unknown>) {}
  async send(_request: ImageHttpRequest): Promise<Result<ImageHttpResponse>> {
    return success({ status: 200, headers: {}, body: this.body, latencyMs: 1 });
  }
}

function geminiRequest() {
  return {
    ...sampleRequest({ requestId: "img_req", providerId: "provider.google" }),
    providerId: asProviderId("provider.google"),
    capabilityId: asCapabilityId("image.generate"),
    modelId: "gemini-3.1-flash-image",
    payload: { prompt: "A tube of hand cream on a marble counter" },
  };
}

const token = { cancelled: false } as never;

describe("image reply without an image", () => {
  it("a text-only Gemini reply is a failed attempt, not a success", async () => {
    const dispatcher = new VendorSyncImageDispatcher(
      GOOGLE_IMAGEN_SPEC,
      GOOGLE_IMAGEN_SPEC.createProtocol(),
      new FixedReplyClient({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: "Here is a description of the pack design…" }] },
          },
        ],
      }),
      { apiKey: "test" },
    );
    const result = await dispatcher.dispatch(geminiRequest(), token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe(NO_IMAGE_REPLY_MESSAGE);
  });

  it("a reply with an image still succeeds", async () => {
    const dispatcher = new VendorSyncImageDispatcher(
      GOOGLE_IMAGEN_SPEC,
      GOOGLE_IMAGEN_SPEC.createProtocol(),
      new FixedReplyClient({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_B64 } }] } },
        ],
      }),
      { apiKey: "test" },
    );
    const result = await dispatcher.dispatch(geminiRequest(), token);
    expect(result.ok).toBe(true);
  });

  it("does not open the circuit breaker (it is not an outage)", () => {
    expect(
      isCallerInputFailureForCircuit({ failureCategory: "unknown", message: NO_IMAGE_REPLY_MESSAGE }),
    ).toBe(true);
  });
});
