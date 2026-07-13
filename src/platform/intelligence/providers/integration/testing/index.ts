/**
 * Integration testing utilities.
 */

import type { IntegrationAction } from "../contracts/enums";
import type { ProviderIntegrationRequest } from "../contracts/request-result";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import { ProviderIntegrationRequestBuilder } from "../builders/integration-request-builder";
import {
  createIntegrationPlatform,
  type CreateIntegrationPlatformOptions,
  type IntegrationPlatform,
} from "../factories/create-integration-platform";

export interface MakeIntegrationRequestOverrides {
  readonly requestId?: string;
  readonly action?: IntegrationAction;
  readonly manifest?: ProviderManifest;
  readonly targetVersion?: string;
}

export function makeIntegrationRequest(
  manifest: ProviderManifest,
  overrides: MakeIntegrationRequestOverrides = {}
): ProviderIntegrationRequest {
  const builder = ProviderIntegrationRequestBuilder.create()
    .withRequestId(overrides.requestId ?? "int_req_1")
    .withAction(overrides.action ?? "register")
    .withManifest(manifest);
  if (overrides.targetVersion) {
    builder.withTargetVersion(overrides.targetVersion);
  }
  return builder.build();
}

export function deterministicHelpers() {
  let idCounter = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++idCounter}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
  };
}

export function setupIntegrationPlatform(
  options: CreateIntegrationPlatformOptions = {}
): IntegrationPlatform {
  const helpers = deterministicHelpers();
  return createIntegrationPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    ...options,
  });
}

/** Full register → install → activate flow helper for tests. */
export async function integrateProvider(
  platform: IntegrationPlatform,
  manifest: ProviderManifest
) {
  const register = await platform.engine.integrate(
    makeIntegrationRequest(manifest, { action: "register", requestId: "reg_1" })
  );
  if (!register.ok) throw register.error;

  const install = await platform.engine.integrate(
    makeIntegrationRequest(manifest, { action: "install", requestId: "ins_1" })
  );
  if (!install.ok) throw install.error;

  const activate = await platform.engine.integrate(
    makeIntegrationRequest(manifest, { action: "activate", requestId: "act_1" })
  );
  if (!activate.ok) throw activate.error;

  return { register: register.value, install: install.value, activate: activate.value };
}
