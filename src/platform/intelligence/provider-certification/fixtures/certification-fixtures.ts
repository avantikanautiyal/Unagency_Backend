/**
 * Certification test fixtures — mock wire payloads and requests.
 */

import {
  asCapabilityId,
  asProviderId,
} from "../../shared/identifiers";
import type { ProviderAdapterRequest } from "../../providers/adapters/contracts/adapter-io";
import { asProviderAdapterId } from "../../providers/adapters/contracts/identifiers";
import { FIXED_NOW } from "../../providers/adapters/testing";

export const CERT_TEST_PROVIDER = asProviderId("cert-test-provider");
export const CERT_TEST_ADAPTER = asProviderAdapterId("cert-test-adapter");
export const CERT_TEST_CAPABILITY = asCapabilityId("text.generate");

export function makeCertificationRequest(
  overrides?: Partial<ProviderAdapterRequest>
): ProviderAdapterRequest {
  return Object.freeze({
    requestId: "cert_req_1",
    providerId: CERT_TEST_PROVIDER,
    adapterId: CERT_TEST_ADAPTER,
    modelId: "test-model",
    capabilityId: CERT_TEST_CAPABILITY,
    modality: "text",
    input: { messages: [{ role: "user", content: "Hello" }] },
    parameters: { temperature: 0.7, maxTokens: 1024 },
    features: ["streaming", "tool_calling", "json_mode"],
    streaming: false,
    timeoutMs: 30_000,
    metadata: {},
    createdAt: FIXED_NOW,
    ...overrides,
  });
}

export function makeMockWireResponse(overrides?: Record<string, unknown>) {
  return Object.freeze({
    id: "wire_resp_1",
    model: "test-model",
    choices: [
      {
        message: { role: "assistant", content: "Hello from mock provider" },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    ...overrides,
  });
}

export function makeStreamingWireChunk(delta: string) {
  return Object.freeze({
    id: "stream_1",
    choices: [{ delta: { content: delta }, finish_reason: null }],
  });
}

export function makeToolCallWireResponse() {
  return Object.freeze({
    id: "wire_tool_1",
    model: "test-model",
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "search", arguments: '{"query":"sneakers"}' },
            },
          ],
        },
        finish_reason: "tool_call",
      },
    ],
    usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 },
  });
}

export function makeJsonWireResponse() {
  return Object.freeze({
    id: "wire_json_1",
    model: "test-model",
    choices: [
      {
        message: {
          role: "assistant",
          content: '{"title":"Sneaker Launch","status":"planned"}',
        },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 18, total_tokens: 30 },
  });
}

export const MOCK_ERRORS = {
  rateLimit: Object.freeze({ status: 429, code: "rate_limit_exceeded", message: "Rate limit" }),
  timeout: Object.freeze({ status: 408, code: "timeout", message: "Request timeout" }),
  auth: Object.freeze({ status: 401, code: "invalid_api_key", message: "Invalid API key" }),
  internal: Object.freeze({ status: 500, code: "internal_error", message: "Internal error" }),
};
