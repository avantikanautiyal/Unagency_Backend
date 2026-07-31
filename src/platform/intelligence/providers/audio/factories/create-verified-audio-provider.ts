/**
 * Factory for verified sync audio provider leaves.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { IProviderDispatcher } from "../../runtime/interfaces/provider-dispatcher";
import type { VerifiedAudioProviderSpec } from "../configs/verified-audio-provider-specs";
import type { VendorAudioAuthContext } from "../common/vendor-audio-protocol";
import { VendorSyncAudioDispatcher } from "../common/vendor-sync-audio-dispatcher";
import {
  FetchAudioHttpClient,
  type IAudioHttpClient,
} from "../http/audio-http-client";
import { SimulatedAudioHttpClient } from "../http/simulated-audio-http-client";

export interface VerifiedAudioProviderPlatform {
  readonly spec: VerifiedAudioProviderSpec;
  readonly mode: "simulated" | "live";
  readonly dispatcher: IProviderDispatcher;
}

export interface CreateVerifiedAudioProviderOptions {
  readonly spec: VerifiedAudioProviderSpec;
  readonly mode?: "simulated" | "live";
  readonly auth?: VendorAudioAuthContext;
  readonly httpClient?: IAudioHttpClient;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
}

export function createVerifiedAudioProvider(
  options: CreateVerifiedAudioProviderOptions
): Result<VerifiedAudioProviderPlatform> {
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
    (options.auth?.apiKey?.trim() ? "live" : "simulated");
  if (mode === "live" && !options.auth?.apiKey?.trim()) {
    return failure(
      new ValidationError(`${spec.credentialEnvVar} required for live ${spec.vendor}`)
    );
  }

  const clockMs = options.clockMs ?? (() => Date.now());
  const http =
    options.httpClient ??
    (mode === "live"
      ? new FetchAudioHttpClient(spec.baseUrl, clockMs, spec.vendor)
      : new SimulatedAudioHttpClient(spec.vendor, clockMs));

  const dispatcher = new VendorSyncAudioDispatcher(
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
