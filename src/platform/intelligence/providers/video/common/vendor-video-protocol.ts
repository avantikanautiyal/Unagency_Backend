/**
 * Verified vendor video protocol — maps canonical async ops to vendor wire APIs.
 * Fake unagency-async-video-v1 must NEVER be used for LIVE.
 */

import type { Result } from "../../../shared/result";
import type {
  ProviderAsyncPollResult,
  ProviderAsyncSubmitResult,
} from "../../async/contracts/provider-operation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { IVideoHttpClient } from "../http/video-http-client";

export interface VendorVideoAuthContext {
  readonly apiKey?: string;
  readonly accessKey?: string;
  readonly secretKey?: string;
  readonly extra?: Readonly<Record<string, string>>;
}

export interface VendorSubmitPlan {
  readonly method: "GET" | "POST" | "DELETE";
  readonly path: string;
  readonly body?: Readonly<Record<string, unknown>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string>>;
}

export interface VendorPollPlan {
  readonly method: "GET" | "POST" | "DELETE";
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string>>;
}

export interface VendorCancelPlan {
  readonly method: "GET" | "POST" | "DELETE";
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: Readonly<Record<string, unknown>>;
}

export interface IVendorVideoProtocol {
  readonly vendorId: string;
  readonly verified: true;
  readonly supportsCancellation: boolean;
  readonly supportsIdempotencyHeader: boolean;

  /** Canonical inventory model suffix → vendor wire model id */
  resolveWireModel(canonicalModelId: string): string | undefined;

  buildAuthHeaders(auth: VendorVideoAuthContext): Result<Readonly<Record<string, string>>>;

  buildSubmit(
    request: ProviderExecutionRequest,
    wireModel: string,
    imageUrls: readonly string[],
    idempotencyKey: string
  ): Result<VendorSubmitPlan>;

  parseSubmit(
    body: Readonly<Record<string, unknown>>,
    headers: Readonly<Record<string, string>>
  ): Result<ProviderAsyncSubmitResult>;

  buildPoll(providerJobId: string, request: ProviderExecutionRequest): Result<VendorPollPlan>;

  parsePoll(
    body: Readonly<Record<string, unknown>>,
    headers: Readonly<Record<string, string>>
  ): Result<ProviderAsyncPollResult>;

  buildCancel?(providerJobId: string): Result<VendorCancelPlan>;
}

export type { IVideoHttpClient };
