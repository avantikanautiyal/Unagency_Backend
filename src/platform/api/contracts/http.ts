/**
 * HTTP / gateway request-response contracts.
 */

import type { ApiVersion, HttpMethod, Permission } from "./enums";
import type { AuthPrincipal } from "./auth";
import type { TenantContext } from "./tenant";

export interface ApiRequest {
  readonly requestId: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly version: ApiVersion;
  readonly headers: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | undefined>>;
  readonly body?: unknown;
  readonly correlationId?: string;
}

export interface ApiResponse<T = unknown> {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: T;
  readonly requestId: string;
  readonly version: ApiVersion;
  readonly durationMs: number;
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>>;
  };
}

export interface ApiSuccessBody<T> {
  readonly data: T;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface ResolvedApiContext {
  readonly request: ApiRequest;
  readonly principal?: AuthPrincipal;
  readonly tenant?: TenantContext;
  readonly permissions: readonly Permission[];
  readonly routeId?: string;
}

export interface RouteDefinition {
  readonly routeId: string;
  readonly version: ApiVersion;
  readonly method: HttpMethod;
  readonly path: string;
  readonly domain: import("./enums").ApiDomain;
  readonly summary: string;
  readonly authRequired: boolean;
  readonly permissions: readonly Permission[];
  readonly rateLimitKey?: string;
  readonly deprecated?: boolean;
}
