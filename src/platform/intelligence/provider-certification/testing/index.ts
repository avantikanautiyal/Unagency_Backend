/**
 * Provider Certification testing utilities.
 */

import {
  FakeTextAdapter,
  makeManifest,
  fixedNow,
  fixedId,
} from "../../providers/adapters/testing";
import { CertificationRequestBuilder } from "../builders/certification-request-builder";
import {
  createProviderCertificationPlatform,
  type ProviderCertificationPlatform,
  type CreateProviderCertificationOptions,
} from "../factories/create-provider-certification";

export function deterministicHelpers() {
  let id = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    clockMs: () => (ms += 2),
  };
}

export function sampleMockAdapter(): FakeTextAdapter {
  return new FakeTextAdapter(makeManifest(), undefined, { nowIso: fixedNow });
}

export function sampleCertificationRequest() {
  const adapter = sampleMockAdapter();
  const manifest = adapter.describe().manifest;
  return CertificationRequestBuilder.create()
    .withRequestId("cert_req_mock")
    .withAdapter(adapter)
    .withManifest(manifest)
    .withMode("full")
    .build();
}

export function setupProviderCertificationPlatform(
  options: CreateProviderCertificationOptions = {}
): ProviderCertificationPlatform {
  const helpers = deterministicHelpers();
  return createProviderCertificationPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}

export { FakeTextAdapter, makeManifest, fixedNow, fixedId };
