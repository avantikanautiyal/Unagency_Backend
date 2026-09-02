/**
 * Deterministic testing utilities for the identity platform.
 *
 * Purpose: Build a platform with controllable clock/ids and seed credentials.
 * Responsibilities: helpers only — no production wiring.
 * Usage: Imported by unit tests.
 * Future Extension: Fixtures for delegation and attestation.
 */

import { asCapabilityId } from "../../../core/identifiers";
import {
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../core/identifiers";
import type { IClock, IIdGenerator } from "../../../core/interfaces";
import { RegisterCredentialInputBuilder } from "../builders/register-credential-input-builder";
import { CreateCredentialSessionRequestBuilder } from "../builders/create-credential-session-request-builder";
import type { RegisterCredentialInput } from "../contracts/requests";
import {
  createIdentityPlatform,
  type CreateIdentityPlatformOptions,
  type ProviderIdentityPlatform,
} from "../factories/create-identity-platform";

export class FixedClock implements IClock {
  private ms: number;
  constructor(startMs = 0) {
    this.ms = startMs;
  }
  now(): Date {
    return new Date(this.ms);
  }
  nowIso(): string {
    return new Date(this.ms).toISOString();
  }
  advance(ms: number): void {
    this.ms += ms;
  }
  set(ms: number): void {
    this.ms = ms;
  }
}

export class SequentialIdGenerator implements IIdGenerator {
  private counter = 0;
  generate(prefix?: string): string {
    this.counter += 1;
    return `${prefix ?? "id"}_${this.counter}`;
  }
}

export interface TestPlatform extends ProviderIdentityPlatform {
  readonly clock: FixedClock;
  readonly ids: SequentialIdGenerator;
}

export function createTestPlatform(
  overrides: CreateIdentityPlatformOptions = {}
): TestPlatform {
  const clock = new FixedClock(1_000_000);
  const ids = new SequentialIdGenerator();
  const platform = createIdentityPlatform({
    clock,
    idGenerator: ids,
    ...overrides,
  });
  return { ...platform, clock, ids };
}

export const TEST_PROVIDER = asProviderId("provider-openai");
export const TEST_ORG = asOrganizationId("org-1");
export const TEST_WORKSPACE = asWorkspaceId("ws-1");
export const TEST_CAPABILITY = asCapabilityId("cap-text-generation");

export function standardCredentialInput(
  overrides: Partial<RegisterCredentialInput> = {}
): RegisterCredentialInput {
  const built = new RegisterCredentialInputBuilder()
    .withProvider(TEST_PROVIDER)
    .withScheme("api_key")
    .withSecret("super-secret-value")
    .withTenancy("organization")
    .withOrganization(TEST_ORG)
    .withWorkspace(TEST_WORKSPACE)
    .withTrustLevel("high")
    .withPermissions(["read", "execute"])
    .build();
  return { ...built, ...overrides };
}

export function standardSessionRequest() {
  return new CreateCredentialSessionRequestBuilder()
    .withProvider(TEST_PROVIDER)
    .withOrganization(TEST_ORG)
    .withWorkspace(TEST_WORKSPACE)
    .withCapability(TEST_CAPABILITY)
    .withRequiredPermissions(["read", "execute"])
    .build();
}
