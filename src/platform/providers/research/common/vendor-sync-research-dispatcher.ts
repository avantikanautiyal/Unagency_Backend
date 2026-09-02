/**
 * Sync research dispatcher — research.web_search via Exa / Tavily HTTP APIs.
 */

import { failure, success, type Result } from "../../../core/result";
import { ProviderError, ValidationError } from "../../../core/errors";
import type { ProviderId } from "../../../core/identifiers";
import type {
  IProviderDispatcher,
  StreamingChunkListener,
} from "../../runtime/interfaces/provider-dispatcher";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../runtime/contracts/provider-execution-response";
import type { VerifiedResearchProviderSpec } from "../configs/verified-research-provider-specs";

export interface VendorResearchAuthContext {
  readonly apiKey?: string;
}

export class VendorSyncResearchDispatcher implements IProviderDispatcher {
  constructor(
    private readonly spec: VerifiedResearchProviderSpec,
    private readonly auth: VendorResearchAuthContext,
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly clockMs: () => number = () => Date.now(),
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  supportsStreaming(_providerId: ProviderId): boolean {
    return false;
  }

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken,
    _onChunk?: StreamingChunkListener
  ): Promise<Result<ProviderExecutionResponse>> {
    const cap = String(request.capabilityId).toLowerCase();
    if (cap !== "research.web_search" && cap !== "text.chat" && !cap.startsWith("research.")) {
      return failure(
        new ValidationError(
          `${this.spec.displayName} does not support capability '${request.capabilityId}'`
        )
      );
    }

    const query = String(
      request.payload.query ?? request.payload.prompt ?? request.payload.text ?? ""
    ).trim();
    if (!query) {
      return failure(new ValidationError("Research query is required"));
    }

    const started = this.clockMs();
    const url = `${this.spec.baseUrl.replace(/\/$/, "")}${this.spec.searchPath}`;

    try {
      const body =
        this.spec.vendor === "exa"
          ? { query, type: "auto", numResults: Number(request.payload.numResults ?? 5) }
          : {
              query,
              api_key: this.auth.apiKey,
              max_results: Number(request.payload.numResults ?? 5),
              include_answer: true,
            };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.spec.vendor === "exa" && this.auth.apiKey) {
        headers["x-api-key"] = this.auth.apiKey;
      }

      if (!this.auth.apiKey) {
        // Simulated offline path
        return success({
          requestId: request.requestId,
          providerId: request.providerId,
          output: {
            content: `[simulated ${this.spec.vendor} search] ${query}`,
            results: [{ title: "Simulated result", url: "https://example.com", snippet: query }],
          },
          usage: { searches: 1 },
          streamed: false,
          finishedAt: this.nowIso(),
          statistics: { executionMs: this.clockMs() - started, streamingMs: 0, retries: 0 },
        });
      }

      const res = await this.fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let parsed: Record<string, unknown> = {};
      try {
        parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        parsed = { raw: text };
      }
      if (!res.ok) {
        return failure(
          new ProviderError(`${this.spec.displayName} HTTP ${res.status}`, {
            status: res.status,
            body: parsed,
            providerId: this.spec.canonicalProviderId,
          })
        );
      }

      const results =
        (parsed.results as unknown[]) ??
        (parsed.documents as unknown[]) ??
        [];
      const answer =
        typeof parsed.answer === "string"
          ? parsed.answer
          : typeof parsed.autopromptString === "string"
            ? parsed.autopromptString
            : undefined;

      return success({
        requestId: request.requestId,
        providerId: request.providerId,
        output: {
          content: answer ?? `[${results.length} research result(s)]`,
          results,
          provider: this.spec.vendor,
        },
        usage: { searches: 1, resultCount: Array.isArray(results) ? results.length : 0 },
        streamed: false,
        finishedAt: this.nowIso(),
        statistics: { executionMs: this.clockMs() - started, streamingMs: 0, retries: 0 },
      });
    } catch (err) {
      return failure(
        new ProviderError(err instanceof Error ? err.message : "Research HTTP failed", {
          cause: err,
          providerId: this.spec.canonicalProviderId,
        })
      );
    }
  }
}
