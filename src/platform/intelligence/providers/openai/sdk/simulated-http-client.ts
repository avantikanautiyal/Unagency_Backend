/**
 * Simulated OpenAI HTTP backend for unit tests — no real networking.
 * Returns discovery and chat completions shaped like the live API.
 */

import { success, type Result } from "../../../shared/result";
import type { IOpenAIHttpClient, OpenAIHttpRequest, OpenAIHttpResponse } from "./openai-http-client";

/**
 * Inventory returned as if discovered from OpenAI /v1/models.
 * Not a platform-hardcoded selection list — simulates API discovery payloads.
 */
const SIMULATED_DISCOVERY_PAYLOAD = Object.freeze({
  object: "list",
  data: [
    { id: "gpt-4o", object: "model", created: 1715558400, owned_by: "openai" },
    { id: "gpt-4o-mini", object: "model", created: 1720892800, owned_by: "openai" },
    { id: "o1", object: "model", created: 1727740800, owned_by: "openai" },
    { id: "o1-mini", object: "model", created: 1727740800, owned_by: "openai" },
    { id: "gpt-4.1", object: "model", created: 1743465600, owned_by: "openai" },
    { id: "gpt-4.1-mini", object: "model", created: 1743465600, owned_by: "openai" },
    { id: "text-embedding-3-large", object: "model", created: 1706083200, owned_by: "openai" },
    { id: "text-embedding-3-small", object: "model", created: 1706083200, owned_by: "openai" },
    { id: "dall-e-3", object: "model", created: 1696636800, owned_by: "openai" },
    { id: "whisper-1", object: "model", created: 1677648000, owned_by: "openai" },
    { id: "tts-1", object: "model", created: 1693526400, owned_by: "openai" },
    { id: "gpt-4o-audio-preview", object: "model", created: 1727740800, owned_by: "openai" },
  ],
});

export class SimulatedOpenAIHttpClient implements IOpenAIHttpClient {
  constructor(private readonly clockMs: () => number = () => Date.now()) {}

  async send(request: OpenAIHttpRequest): Promise<Result<OpenAIHttpResponse>> {
    const start = this.clockMs();
    if (request.method === "GET" && request.path.includes("/models")) {
      return success({
        status: 200,
        headers: { "content-type": "application/json" },
        body: SIMULATED_DISCOVERY_PAYLOAD,
        latencyMs: this.clockMs() - start,
      });
    }

    if (request.path.includes("/embeddings")) {
      return success({
        status: 200,
        headers: {},
        body: {
          object: "list",
          data: [{ object: "embedding", embedding: [0.1, 0.2, 0.3], index: 0 }],
          model: request.body?.model,
          usage: { prompt_tokens: 8, total_tokens: 8 },
        },
        latencyMs: this.clockMs() - start,
      });
    }

    if (request.path.includes("/images/generations")) {
      return success({
        status: 200,
        headers: {},
        body: {
          created: Math.floor(Date.now() / 1000),
          data: [{ url: "https://example.local/simulated.png" }],
        },
        latencyMs: this.clockMs() - start,
      });
    }

    if (request.path.includes("/moderations")) {
      return success({
        status: 200,
        headers: {},
        body: {
          id: "modr_sim",
          model: request.body?.model ?? "omni-moderation-latest",
          results: [{ flagged: false, categories: {}, category_scores: {} }],
        },
        latencyMs: this.clockMs() - start,
      });
    }

    // Default: chat completions
    const model = String(request.body?.model ?? "unknown");
    return success({
      status: 200,
      headers: {},
      body: {
        id: "chatcmpl_sim",
        object: "chat.completion",
        model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Simulated OpenAI response",
              ...(request.body?.tools
                ? {
                    tool_calls: [
                      {
                        id: "call_sim",
                        type: "function",
                        function: { name: "demo", arguments: "{}" },
                      },
                    ],
                  }
                : {}),
            },
            finish_reason: request.body?.tools ? "tool_calls" : "stop",
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 18,
          total_tokens: 30,
          completion_tokens_details: { reasoning_tokens: model.startsWith("o1") ? 5 : 0 },
        },
      },
      latencyMs: this.clockMs() - start,
    });
  }
}
