/**
 * Simulated Anthropic Messages API — zero external networking.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ProviderError } from "../../../shared/errors";
import type {
  AnthropicHttpRequest,
  AnthropicHttpResponse,
  IAnthropicHttpClient,
} from "./anthropic-http-client";
import { ANTHROPIC_SEED_MODELS } from "../constants";

export class SimulatedAnthropicHttpClient implements IAnthropicHttpClient {
  constructor(
    private readonly clockMs: () => number = () => Date.now(),
    private readonly injectError?: (request: AnthropicHttpRequest) => ProviderError | undefined
  ) {}

  async send(request: AnthropicHttpRequest): Promise<Result<AnthropicHttpResponse>> {
    const start = this.clockMs();
    const injected = this.injectError?.(request);
    if (injected) return failure(injected);

    if (request.path.includes("/messages")) {
      const model = String(request.body?.model ?? ANTHROPIC_SEED_MODELS[0]);
      const messages = request.body?.messages as Array<Record<string, unknown>> | undefined;
      const hasVision = messages?.some((m) =>
        Array.isArray(m.content) &&
        (m.content as unknown[]).some(
          (b) => typeof b === "object" && b && (b as Record<string, unknown>).type === "image"
        )
      );
      const text = hasVision
        ? `[simulated:anthropic:vision] analysis for ${model}`
        : `[simulated:anthropic] response for ${model}`;
      return success({
        status: 200,
        headers: { "request-id": `sim_anthropic_${start}` },
        body: {
          id: `msg_sim_${start}`,
          type: "message",
          role: "assistant",
          model,
          content: [{ type: "text", text }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 20 },
        },
        latencyMs: this.clockMs() - start,
      });
    }

    return failure(new ProviderError(`Simulated Anthropic HTTP: unsupported path ${request.path}`));
  }
}
