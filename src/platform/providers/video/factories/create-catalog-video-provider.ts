/**
 * Factory for catalog async video provider leaves.
 */

import { success, type Result } from "../../../core/result";
import type { VideoProviderConfig } from "../contracts/video-provider-config";
import {
  CatalogAsyncVideoDispatcher,
  catalogVideoProviderId,
} from "../dispatcher/catalog-async-video-dispatcher";
import { FetchVideoHttpClient, type IVideoHttpClient } from "../http/video-http-client";
import { FakeVideoHttpClient } from "../http/fake-video-http-client";
import type { BlobAccessService } from "../../../media/blob/blob-access-service";
import type { IAsyncProviderDispatcher } from "../../async/interfaces/async-provider-dispatcher";

export interface CatalogVideoProviderPlatform {
  readonly config: VideoProviderConfig;
  readonly mode: "simulated" | "live";
  readonly dispatcher: IAsyncProviderDispatcher;
}

export interface CreateCatalogVideoProviderOptions {
  readonly config: VideoProviderConfig;
  readonly mode?: "simulated" | "live";
  readonly apiKey?: string;
  readonly httpClient?: IVideoHttpClient;
  readonly blobAccess?: BlobAccessService;
  readonly pollsBeforeComplete?: number;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
}

export function createCatalogVideoProvider(
  options: CreateCatalogVideoProviderOptions
): Result<CatalogVideoProviderPlatform> {
  const mode = options.mode ?? (options.apiKey ? "live" : "simulated");
  const clockMs = options.clockMs ?? (() => Date.now());

  const http: IVideoHttpClient =
    options.httpClient ??
    (mode === "live"
      ? {
          async send(request) {
            const client = new FetchVideoHttpClient(
              options.config.baseUrl,
              clockMs,
              options.config.canonicalProviderId
            );
            return client.send({
              ...request,
              headers: {
                Authorization: `Bearer ${options.apiKey ?? ""}`,
                ...(request.headers ?? {}),
              },
            });
          },
        }
      : new FakeVideoHttpClient(
          options.config,
          options.config.contract,
          options.pollsBeforeComplete ?? 2,
          clockMs
        ));

  const dispatcher = new CatalogAsyncVideoDispatcher(
    options.config,
    http,
    options.blobAccess,
    options.nowIso
  );

  return success({
    config: options.config,
    mode,
    dispatcher,
  });
}

export { catalogVideoProviderId };
