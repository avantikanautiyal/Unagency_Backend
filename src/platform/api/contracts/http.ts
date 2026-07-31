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
  /**
   * M9.5O — when set, Express transport writes SSE instead of JSON body.
   * Body may still hold a small meta envelope for non-SSE clients.
   */
  readonly sse?: {
    readonly frames: readonly import("./streaming").SseFrame[];
    /** Optional async producer for live streams (tests / orchestrator). */
    readonly frameIterable?: AsyncIterable<import("./streaming").SseFrame>;
    /** Abort in-flight stream when the HTTP client disconnects. */
    readonly cancel?: (reason?: string) => void;
  };
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
