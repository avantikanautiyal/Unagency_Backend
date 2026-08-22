/**
 * Factory for verified sync image provider leaves.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { IProviderDispatcher } from "../../runtime/interfaces/provider-dispatcher";
import type { VerifiedImageProviderSpec } from "../configs/verified-image-provider-specs";
import type { VendorImageAuthContext } from "../common/vendor-image-protocol";
import { VendorSyncImageDispatcher } from "../common/vendor-sync-image-dispatcher";
import {
  FetchImageHttpClient,
  type IImageHttpClient,
} from "../http/image-http-client";
import { SimulatedImageHttpClient } from "../http/simulated-image-http-client";

export interface VerifiedImageProviderPlatform {
  readonly spec: VerifiedImageProviderSpec;
  readonly mode: "simulated" | "live";
  readonly dispatcher: IProviderDispatcher;
}

export interface CreateVerifiedImageProviderOptions {
  readonly spec: VerifiedImageProviderSpec;
  readonly mode?: "simulated" | "live";
  readonly auth?: VendorImageAuthContext;
  readonly httpClient?: IImageHttpClient;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
}

export function createVerifiedImageProvider(
  options: CreateVerifiedImageProviderOptions
): Result<VerifiedImageProviderPlatform> {
  const spec = options.spec;
  if (!spec.vendorApiVerified) {
    return failure(
      new ValidationError(
        `${spec.displayName} is not LIVE-executable: ${spec.blockedReason ?? "API_CONTRACT_UNVERIFIED"}`
      )
    );
  }

  const mode =
    options.mode ?? (options.auth?.apiKey?.trim() ? "live" : "simulated");
  if (mode === "live" && !options.auth?.apiKey?.trim()) {
    return failure(
      new ValidationError(`${spec.credentialEnvVar} required for live ${spec.vendor}`)
    );
  }

  const clockMs = options.clockMs ?? (() => Date.now());
  const http =
    options.httpClient ??
    (mode === "live"
      ? new FetchImageHttpClient(spec.baseUrl, clockMs, spec.vendor)
      : new SimulatedImageHttpClient(spec.vendor, clockMs));

  const dispatcher = new VendorSyncImageDispatcher(
    spec,
    spec.createProtocol(),
    http,
    options.auth ?? {},
    options.nowIso,
    clockMs
  );

  return success({
    spec,
    mode,
    dispatcher,
  });
}
