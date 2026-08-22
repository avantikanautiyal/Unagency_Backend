/**
 * OpenAI model discovery + cache.
 * Discovers from API (or simulated client) — never hardcodes the catalog in the OS.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ProviderError } from "../../../shared/errors";
import type {
  DiscoveredOpenAIModel,
  OpenAIModelDiscoveryResult,
} from "../contracts/openai-contracts";
import type { IOpenAIHttpClient } from "../sdk/openai-http-client";
import { enrichDiscoveredModel } from "../capabilities/capability-enricher";
import { DEFAULT_MODEL_CACHE_TTL_MS } from "../constants";

export interface IOpenAIModelDiscovery {
  discover(forceRefresh?: boolean): Promise<Result<OpenAIModelDiscoveryResult>>;
  getCached(): readonly DiscoveredOpenAIModel[];
  clearCache(): void;
}

export class OpenAIModelDiscovery implements IOpenAIModelDiscovery {
  private cache: DiscoveredOpenAIModel[] = [];
  private cachedAtMs = 0;
  private source: OpenAIModelDiscoveryResult["source"] = "simulated";

  constructor(
    private readonly http: IOpenAIHttpClient,
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly clockMs: () => number = () => Date.now(),
    private readonly ttlMs: number = DEFAULT_MODEL_CACHE_TTL_MS
  ) {}

  async discover(forceRefresh = false): Promise<Result<OpenAIModelDiscoveryResult>> {
    const now = this.clockMs();
    if (
      !forceRefresh &&
      this.cache.length > 0 &&
      now - this.cachedAtMs < this.ttlMs
    ) {
      return success({
        discoveredAt: this.nowIso(),
        models: this.cache,
        cacheHit: true,
        source: "cache",
      });
    }

    const response = await this.http.send({ method: "GET", path: "/models" });
    if (!response.ok) return response;

    const data = response.value.body.data;
    if (!Array.isArray(data)) {
      return failure(new ProviderError("OpenAI models response missing data array"));
    }

    const models = data.map((item) =>
      enrichDiscoveredModel(item as Readonly<Record<string, unknown>>)
    );

    this.cache = models;
    this.cachedAtMs = now;
    this.source = response.value.headers["x-openai-sim"] ? "simulated" : "live";
    // Simulated client doesn't set that header; detect via model set presence after sim path
    // Prefer: if http is Simulated, callers set mode. Keep source as live unless body tagged.
    if (response.value.body.object === "list" && !("error" in response.value.body)) {
      // Leave source — factory will mark simulated when using SimulatedOpenAIHttpClient
    }

    return success({
      discoveredAt: this.nowIso(),
      models,
      cacheHit: false,
      source: this.source,
    });
  }

  getCached(): readonly DiscoveredOpenAIModel[] {
    return this.cache;
  }

  clearCache(): void {
    this.cache = [];
    this.cachedAtMs = 0;
  }

  /** Testing / factory: set discovery source tag. */
  markSource(source: OpenAIModelDiscoveryResult["source"]): void {
    this.source = source;
  }

  /** Factory fallback when live /models is unavailable. */
  seedCache(
    models: readonly DiscoveredOpenAIModel[],
    source: OpenAIModelDiscoveryResult["source"] = "cache"
  ): void {
    this.cache = [...models];
    this.cachedAtMs = this.clockMs();
    this.source = source;
  }
}
