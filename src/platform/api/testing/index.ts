/**
 * Testing helpers for Enterprise API Gateway.
 */

import {
  createEnterpriseApiPlatform,
  type CreateEnterpriseApiOptions,
  type EnterpriseApiPlatform,
} from "../factories/create-enterprise-api-platform";
import type { ApiRequest, ApiVersion, HttpMethod, IssuedToken } from "../contracts";

export function deterministicApiHelpers() {
  let id = 0;
  let ms = 1_000;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => new Date(ms).toISOString(),
    clockMs: () => (ms += 5),
  };
}

export function setupEnterpriseApi(
  options: CreateEnterpriseApiOptions = {}
): EnterpriseApiPlatform {
  const helpers = deterministicApiHelpers();
  return createEnterpriseApiPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    seedDemoTenant: true,
    ...options,
  });
}

export function apiRequest(input: {
  method: HttpMethod;
  path: string;
  version?: ApiVersion;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string | undefined>;
  requestId?: string;
}): ApiRequest {
  const version = input.version ?? "v1";
  return {
    requestId: input.requestId ?? `req_${Math.random().toString(36).slice(2, 8)}`,
    method: input.method,
    path: input.path.startsWith("/v") ? input.path : `/${version}${input.path}`,
    version,
    headers: input.headers ?? {},
    body: input.body,
    query: input.query,
    correlationId: "corr_test",
  };
}

export async function loginDemo(
  platform: EnterpriseApiPlatform
): Promise<{ token: string; organizationId: string }> {
  const organizationId = platform.seed!.organizationId;
  const res = await platform.gateway.handle(
    apiRequest({
      method: "POST",
      path: "/v1/auth/login",
      body: {
        email: "admin@unagency.local",
        password: "admin",
        organizationId,
        deviceId: "device_1",
        scheme: "jwt",
      },
    })
  );
  if (!res.ok || res.value.status >= 400) {
    throw new Error(`login failed: ${JSON.stringify(res)}`);
  }
  const body = res.value.body as { data: IssuedToken };
  return { token: body.data.accessToken, organizationId };
}
