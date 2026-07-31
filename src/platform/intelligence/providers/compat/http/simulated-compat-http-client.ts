/**
 * Simulated OpenAI-compatible HTTP backend — zero external networking.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ProviderError } from "../../../shared/errors";
import type { TextProviderConfig } from "../contracts/text-provider-config";
import type {
  CompatHttpRequest,
  CompatHttpResponse,
  ICompatHttpClient,
} from "./compat-http-client";

export class SimulatedCompatHttpClient implements ICompatHttpClient {
  constructor(
    private readonly config: TextProviderConfig,
    private readonly clockMs: () => number = () => Date.now(),
    private readonly injectError?: (request: CompatHttpRequest) => ProviderError | undefined
  ) {}

  async send(request: CompatHttpRequest): Promise<Result<CompatHttpResponse>> {
    const start = this.clockMs();
    const injected = this.injectError?.(request);
    if (injected) return failure(injected);

    if (request.method === "GET" && request.path.includes("/models")) {
      return success({
        status: 200,
        headers: { "content-type": "application/json" },
        body: {
          object: "list",
          data: this.config.seedWireModels.map((id) => ({
            id,
            object: "model",
            owned_by: this.config.vendor,
          })),
        },
        latencyMs: this.clockMs() - start,
      });
    }

    if (request.path.includes("/chat/completions")) {
      const model = String(request.body?.model ?? this.config.seedWireModels[0] ?? "unknown");
      const messages = request.body?.messages as Array<Record<string, unknown>> | undefined;
      const hasVision = messages?.some((m) =>
        Array.isArray(m.content) &&
        (m.content as unknown[]).some(
          (p) => typeof p === "object" && p && (p as Record<string, unknown>).type === "image_url"
        )
      );
      const content = hasVision
        ? `[simulated:${this.config.vendor}:vision] analysis for ${model}`
        : `[simulated:${this.config.vendor}] response for ${model}`;
      return success({
        status: 200,
        headers: {},
        body: {
          id: `${this.config.vendor}_sim_${start}`,
          object: "chat.completion",
          model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content,
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 24, total_tokens: 36 },
        },
        latencyMs: this.clockMs() - start,
      });
    }

    if (request.path.includes("/embeddings")) {
      const model = String(request.body?.model ?? "mistral-embed");
      return success({
        status: 200,
        headers: {},
        body: {
          object: "list",
          data: [{ object: "embedding", embedding: [0.11, 0.22, 0.33, 0.44], index: 0 }],
          model,
          usage: { prompt_tokens: 4, total_tokens: 4 },
        },
        latencyMs: this.clockMs() - start,
      });
    }

    return failure(
      new ProviderError(`Simulated ${this.config.vendor} HTTP: unsupported path ${request.path}`)
    );
  }
}
