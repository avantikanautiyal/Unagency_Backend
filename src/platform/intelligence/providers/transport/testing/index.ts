/**
 * Transport testing utilities.
 *
 * Purpose: Deterministic fixtures + a ready-to-use platform for tests.
 * Responsibilities: Build canonical requests; deterministic ids/clock.
 * Usage: Imported by unit tests only.
 * Future Extension: Streaming fixtures.
 */

import { asProviderId, type ProviderId } from "../../../shared/identifiers";
import type { CanonicalProviderRequest } from "../contracts/canonical";
import type { TransportProtocol } from "../contracts/enums";
import { CanonicalProviderRequestBuilder } from "../builders/canonical-request-builder";
import {
  createTransportPlatform,
  type CreateTransportPlatformOptions,
  type TransportPlatform,
} from "../factories/create-transport-platform";

export const TEST_PROVIDER_ID: ProviderId = asProviderId("provider.test");

export interface MakeRequestOverrides {
  readonly requestId?: string;
  readonly providerId?: ProviderId;
  readonly protocol?: TransportProtocol;
  readonly operation?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly streaming?: boolean;
  readonly timeoutMs?: number;
}

export function makeCanonicalRequest(
  overrides: MakeRequestOverrides = {}
): CanonicalProviderRequest {
  return CanonicalProviderRequestBuilder.create()
    .withRequestId(overrides.requestId ?? "req_test_1")
    .withProviderId(overrides.providerId ?? TEST_PROVIDER_ID)
    .withProtocol(overrides.protocol ?? "local")
    .withOperation(overrides.operation ?? "chat.completions")
    .withPayload(overrides.payload ?? { prompt: "hello" })
    .withStreaming(overrides.streaming ?? false)
    .withTimeout(overrides.timeoutMs ?? 30_000)
    .build();
}

/** Deterministic id + clock generators for stable assertions. */
export function deterministicHelpers() {
  let idCounter = 0;
  let msCounter = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++idCounter}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    clockMs: () => (msCounter += 5),
  };
}

export function setupTransportPlatform(
  options: CreateTransportPlatformOptions = {}
): TransportPlatform {
  const helpers = deterministicHelpers();
  return createTransportPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    retrySleep: () => Promise.resolve(),
    ...options,
  });
}
