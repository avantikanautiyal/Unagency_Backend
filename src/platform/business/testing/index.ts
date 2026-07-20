/**
 * Business Platform testing helpers.
 */

import {
  createBusinessPlatform,
  type BusinessPlatform,
  type CreateBusinessPlatformOptions,
} from "../factories/create-business-platform";
import { apiRequest } from "../../api/testing";
import type { IssuedToken } from "../../api/contracts";

export function deterministicBusinessHelpers() {
  let id = 0;
  let ms = 5_000;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => new Date(ms).toISOString(),
    clockMs: () => (ms += 7),
  };
}

export function setupBusinessPlatform(
  options: CreateBusinessPlatformOptions = {}
): BusinessPlatform {
  const helpers = deterministicBusinessHelpers();
  return createBusinessPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    alignWithApiSeed: true,
    ...options,
  });
}

/** Login to Enterprise API Gateway using aligned seed credentials. */
export async function gatewayLogin(platform: BusinessPlatform): Promise<string> {
  const seed = platform.seed!;
  const res = await platform.api.gateway.handle(
    apiRequest({
      method: "POST",
      path: "/v1/auth/login",
      body: {
        email: seed.email,
        password: seed.password,
        organizationId: seed.organizationId,
        deviceId: "biz_device",
        scheme: "jwt",
      },
    })
  );
  if (!res.ok || res.value.status >= 400) {
    throw new Error(`gateway login failed: ${JSON.stringify(res)}`);
  }
  return (res.value.body as { data: IssuedToken }).data.accessToken;
}
