/**
 * Factory for verified vendor video provider leaves.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import { asProviderId, type ProviderId } from "../../../shared/identifiers";
import type { IAsyncProviderDispatcher } from "../../async/interfaces/async-provider-dispatcher";
import type { BlobAccessService } from "../../../../media/blob/blob-access-service";
import { VendorAsyncVideoDispatcher } from "../common/vendor-async-video-dispatcher";
import type { VendorVideoAuthContext } from "../common/vendor-video-protocol";
import {
  FetchVideoHttpClient,
  type IVideoHttpClient,
} from "../http/video-http-client";
import type { VerifiedVideoProviderSpec } from "../configs/verified-video-provider-specs";
import {
  MinimaxVideoProtocol,
  buildMinimaxFileRetrievePlan,
} from "../minimax/minimax-video-protocol";
import { PixverseVideoProtocol } from "../pixverse/pixverse-video-protocol";
import {
  PixverseI2vDispatcher,
  type ProviderInputBytesLoader,
} from "../pixverse/pixverse-i2v-dispatcher";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderAsyncPollResult } from "../../async/contracts/provider-operation";

export interface VerifiedVideoProviderPlatform {
  readonly spec: VerifiedVideoProviderSpec;
  readonly mode: "simulated" | "live";
  readonly dispatcher: IAsyncProviderDispatcher;
}

export interface CreateVerifiedVideoProviderOptions {
  readonly spec: VerifiedVideoProviderSpec;
  readonly mode?: "simulated" | "live";
  readonly auth?: VendorVideoAuthContext;
  readonly httpClient?: IVideoHttpClient;
  readonly blobAccess?: BlobAccessService;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  /** PixVerse I2V / tests: inject asset byte loader (zero-network). */
  readonly inputBytesLoader?: ProviderInputBytesLoader;
}

export function createVerifiedVideoProvider(
  options: CreateVerifiedVideoProviderOptions
): Result<VerifiedVideoProviderPlatform> {
  const spec = options.spec;
  if (!spec.vendorApiVerified) {
    return failure(
      new ValidationError(
        `${spec.displayName} is not LIVE-executable: ${spec.blockedReason ?? "API_CONTRACT_UNVERIFIED"}`
      )
    );
  }

  const mode =
    options.mode ??
    (options.auth?.apiKey || options.auth?.accessKey ? "live" : "simulated");
  if (mode === "live") {
    if (spec.secretEnvVar) {
      if (!options.auth?.accessKey?.trim() || !options.auth?.secretKey?.trim()) {
        return failure(
          new ValidationError(
            `${spec.accessKeyEnvVar ?? spec.credentialEnvVar} and ${spec.secretEnvVar} required`
          )
        );
      }
    } else if (!options.auth?.apiKey?.trim()) {
      return failure(
        new ValidationError(`${spec.credentialEnvVar} required for live ${spec.vendor}`)
      );
    }
  }

  const clockMs = options.clockMs ?? (() => Date.now());
  const http =
    options.httpClient ??
    (mode === "live"
      ? new FetchVideoHttpClient(spec.baseUrl, clockMs, spec.canonicalProviderId)
      : undefined);

  if (!http) {
    return failure(
      new ValidationError("httpClient required for simulated verified video providers")
    );
  }

  const protocol = spec.createProtocol();
  const auth: VendorVideoAuthContext = options.auth ?? {};

  let dispatcher: IAsyncProviderDispatcher;

  if (spec.vendor === "pixverse") {
    dispatcher = new PixverseI2vDispatcher(
      spec.canonicalProviderId,
      protocol as PixverseVideoProtocol,
      http,
      auth,
      options.blobAccess,
      options.inputBytesLoader
    );
  } else {
    dispatcher = new VendorAsyncVideoDispatcher(
      spec.canonicalProviderId,
      protocol,
      http,
      auth,
      options.blobAccess,
      options.nowIso
    );
  }

  if (spec.vendor === "minimax") {
    dispatcher = new MinimaxFileRetrieveDispatcher(
      dispatcher,
      http,
      auth,
      protocol as MinimaxVideoProtocol
    );
  }

  return success({
    spec,
    mode,
    dispatcher,
  });
}

class MinimaxFileRetrieveDispatcher implements IAsyncProviderDispatcher {
  constructor(
    private readonly inner: IAsyncProviderDispatcher,
    private readonly http: IVideoHttpClient,
    private readonly auth: VendorVideoAuthContext,
    private readonly protocol: MinimaxVideoProtocol
  ) {}

  executionSemantics() {
    return this.inner.executionSemantics();
  }
  supportsStreaming(providerId: ProviderId) {
    return this.inner.supportsStreaming(providerId);
  }
  supportsCancellation(providerId: ProviderId) {
    return this.inner.supportsCancellation(providerId);
  }
  dispatch(request: ProviderExecutionRequest, token: CancellationToken) {
    return this.inner.dispatch(request, token);
  }
  submitAsync(
    request: ProviderExecutionRequest,
    token: CancellationToken,
    idempotencyKey: string
  ) {
    return this.inner.submitAsync(request, token, idempotencyKey);
  }
  cancelAsync(
    request: ProviderExecutionRequest,
    providerJobId: string,
    token: CancellationToken
  ): Promise<Result<void>> {
    if (!this.inner.cancelAsync) {
      return Promise.resolve(
        failure(new ValidationError("Provider does not support cancellation"))
      );
    }
    return this.inner.cancelAsync(request, providerJobId, token);
  }

  async pollAsync(
    request: ProviderExecutionRequest,
    providerJobId: string,
    token: CancellationToken
  ): Promise<Result<ProviderAsyncPollResult>> {
    const poll = await this.inner.pollAsync(request, providerJobId, token);
    if (!poll.ok) return poll;
    const meta = poll.value.safeMetadata as
      | { needsFileRetrieve?: boolean; fileId?: string }
      | undefined;
    if (
      poll.value.status === "pending" &&
      meta?.needsFileRetrieve &&
      typeof meta.fileId === "string"
    ) {
      const authHeaders = this.protocol.buildAuthHeaders(this.auth);
      if (!authHeaders.ok) return authHeaders;
      const plan = buildMinimaxFileRetrievePlan(meta.fileId);
      const qs = plan.query ? `?${new URLSearchParams(plan.query).toString()}` : "";
      const retrieved = await this.http.send({
        method: plan.method,
        path: `${plan.path}${qs}`,
        headers: { ...authHeaders.value },
      });
      if (!retrieved.ok) return retrieved;
      const file = retrieved.value.body.file as { download_url?: string } | undefined;
      const downloadUrl = file?.download_url;
      if (!downloadUrl) {
        return success({ status: "pending", nextPollAfterMs: 2000, safeMetadata: meta });
      }
      return success({
        status: "completed",
        outputs: [
          { index: 0, type: "video", mimeType: "video/mp4", temporaryUrl: downloadUrl },
        ],
        safeMetadata: { vendorStatus: "Success", fileId: meta.fileId },
      });
    }
    return poll;
  }
}

export { asProviderId };
