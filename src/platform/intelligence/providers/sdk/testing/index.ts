/**
 * SDK testing utilities.
 *
 * Purpose: Deterministic fixtures + a ready-to-use platform for tests.
 * Responsibilities: Build SDK requests; deterministic ids/clock.
 * Usage: Imported by unit tests only.
 * Future Extension: Mock SDK wrappers with functional execute.
 */

import { asProviderId, type ProviderId } from "../../../shared/identifiers";
import type { SdkVendor } from "../contracts/enums";
import type { SdkRequest } from "../contracts/request-response";
import { SdkRequestBuilder } from "../builders/sdk-request-builder";
import {
  createSdkPlatform,
  type CreateSdkPlatformOptions,
  type SdkPlatform,
} from "../factories/create-sdk-platform";

export const TEST_PROVIDER_ID: ProviderId = asProviderId("provider.test");

export interface MakeSdkRequestOverrides {
  readonly requestId?: string;
  readonly providerId?: ProviderId;
  readonly vendor?: SdkVendor;
  readonly operation?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly streaming?: boolean;
}

export function makeSdkRequest(
  overrides: MakeSdkRequestOverrides = {}
): SdkRequest {
  return SdkRequestBuilder.create()
    .withRequestId(overrides.requestId ?? "sdk_req_1")
    .withProviderId(overrides.providerId ?? TEST_PROVIDER_ID)
    .withVendor(overrides.vendor ?? "openai")
    .withOperation(overrides.operation ?? "chat.completions")
    .withPayload(overrides.payload ?? { model: "gpt-test", prompt: "hi" })
    .withStreaming(overrides.streaming ?? false)
    .build();
}

export function deterministicHelpers() {
  let idCounter = 0;
  let msCounter = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++idCounter}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    clockMs: () => (msCounter += 5),
  };
}

export function setupSdkPlatform(
  options: CreateSdkPlatformOptions = {}
): SdkPlatform {
  const helpers = deterministicHelpers();
  return createSdkPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    retrySleep: () => Promise.resolve(),
    ...options,
  });
}
