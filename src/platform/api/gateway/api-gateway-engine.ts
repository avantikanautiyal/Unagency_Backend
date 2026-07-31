/**
 * Enterprise API Gateway — sole external entry point into the platform.
 * Frontends never reach Runtime / Routing / Providers directly.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { AuthorizationError } from "../../intelligence/shared/errors";
import type {
  ApiRequest,
  ApiResponse,
  AuthCredential,
  AuthPrincipal,
  RouteDefinition,
  TenantContext,
} from "../contracts";
import type {
  IApiGateway,
  IAuthenticationService,
  IAuthorizationService,
  ICatalogApiService,
  IExecutionApiService,
  IRateLimitService,
  IStreamingService,
  ITenantService,
} from "../interfaces";
import type { IExecutionIntelligenceApiService } from "../execution-intelligence";
import { matchRoute, API_ROUTE_MAP } from "../routes/route-map";
import { isLiveSsePayload } from "../services/execution-streaming-service";
import { validateApiRequest } from "../validation/validate-request";
import { defaultHeaders, serializeError, serializeSuccess } from "../serialization/serialize";
import { dispatchController, type ControllerDeps } from "../controllers/dispatch";
import { resolveTenantContext } from "../auth/tenant-resolution";

export interface ApiGatewayDeps {
  readonly auth: IAuthenticationService;
  readonly authorization: IAuthorizationService;
  readonly tenants: ITenantService;
  readonly executions: IExecutionApiService;
  readonly streaming: IStreamingService;
  readonly rateLimits: IRateLimitService;
  readonly catalog: ICatalogApiService;
  readonly executionIntelligence?: IExecutionIntelligenceApiService;
  readonly currentPrincipal?: ControllerDeps["currentPrincipal"];
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
}

export class ApiGatewayEngine implements IApiGateway {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly controllers: ControllerDeps;

  constructor(private readonly deps: ApiGatewayDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.controllers = {
      auth: deps.auth,
      tenants: deps.tenants,
      executions: deps.executions,
      streaming: deps.streaming,
      catalog: deps.catalog,
      executionIntelligence: deps.executionIntelligence,
      currentPrincipal: deps.currentPrincipal,
    };
  }

  listRoutes(version?: string): Result<readonly RouteDefinition[]> {
    if (!version) return success(API_ROUTE_MAP);
    return success(API_ROUTE_MAP.filter((r) => r.version === version));
  }

  async handle(request: ApiRequest): Promise<Result<ApiResponse>> {
    const start = this.clockMs();
    const validated = validateApiRequest(request);
    if (!validated.ok) {
      return success(
        this.errorResponse(request, 400, validated.error.code, validated.error.message, start)
      );
    }

    const matched = matchRoute(request.method, request.path);
    if (!matched) {
      return success(
        this.errorResponse(
          request,
          404,
          "NOT_FOUND",
          `no route for ${request.method} ${request.path}`,
          start
        )
      );
    }
    const { route, params } = matched;

    let principal: AuthPrincipal | undefined;
    if (route.authRequired) {
      const credential = extractCredential(request);
      if (!credential.ok) {
        return success(
          this.errorResponse(request, 401, "AUTHORIZATION_ERROR", credential.error.message, start)
        );
      }
      const authed = await this.deps.auth.authenticate(credential.value);
      if (!authed.ok) {
        return success(
          this.errorResponse(request, 401, "AUTHORIZATION_ERROR", authed.error.message, start)
        );
      }
      principal = authed.value;

      const authz = this.deps.authorization.authorize(principal, route.permissions);
      if (!authz.ok) {
        return success(
          this.errorResponse(request, 403, "AUTHORIZATION_ERROR", authz.error.message, start)
        );
      }
    }

    const tenant = resolveTenantContext(request, principal, params);
    if (route.authRequired && tenant) {
      const isolation = await this.deps.tenants.ensureTenant(tenant);
      if (!isolation.ok) {
        const status = isolation.error.code === "NOT_FOUND" ? 404 : 403;
        return success(
          this.errorResponse(request, status, isolation.error.code, isolation.error.message, start)
        );
      }
    }

    if (route.authRequired) {
      const rl = await this.deps.rateLimits.check({
        organizationId: tenant?.organizationId ?? principal?.organizationId,
        workspaceId: tenant?.workspaceId ?? principal?.workspaceId,
        userId: principal?.userId,
        apiKeyId: principal?.apiKeyId,
        capabilityId:
          typeof (request.body as { capabilityId?: string } | undefined)?.capabilityId === "string"
            ? (request.body as { capabilityId: string }).capabilityId
            : undefined,
      });
      if (!rl.ok) {
        const status =
          rl.error.message.includes("unavailable") || rl.error.message.includes("fail-closed")
            ? 503
            : 500;
        return success(
          this.errorResponse(request, status, rl.error.code, rl.error.message, start)
        );
      }
      if (!rl.value.allowed) {
        return success(
          this.errorResponse(
            request,
            429,
            "RATE_LIMIT_ERROR",
            `rate limit exceeded for ${rl.value.dimension}`,
            start,
            { remaining: rl.value.remaining, resetAt: rl.value.resetAt }
          )
        );
      }
    }

    const result = await dispatchController(
      this.controllers,
      route.routeId,
      request,
      params,
      principal,
      tenant
    );

    if (!result.ok) {
      return success(
        this.errorResponse(
          request,
          statusForError(result.error.code),
          result.error.code,
          result.error.message,
          start
        )
      );
    }

    // M10.8 — live SSE from StreamingExecutionOrchestrator (simulated FakeStreamingDispatcher).
    if (isLiveSsePayload(result.value)) {
      return success({
        status: 200,
        headers: {
          ...defaultHeaders(request.version),
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "x-request-id": request.requestId,
          "x-correlation-id": request.correlationId ?? request.requestId,
          "x-execution-id": result.value.executionId,
        },
        body: serializeSuccess(
          { executionId: result.value.executionId, streaming: true },
          { routeId: route.routeId, domain: route.domain }
        ),
        sse: {
          frames: result.value.frames,
          frameIterable: result.value.frameIterable,
          cancel: result.value.cancel,
        },
        requestId: request.requestId,
        version: request.version,
        durationMs: this.clockMs() - start,
      });
    }

    return success({
      status: request.method === "POST" ? 201 : 200,
      headers: {
        ...defaultHeaders(request.version),
        "x-request-id": request.requestId,
        "x-correlation-id": request.correlationId ?? request.requestId,
      },
      body: serializeSuccess(result.value, {
        routeId: route.routeId,
        domain: route.domain,
      }),
      requestId: request.requestId,
      version: request.version,
      durationMs: this.clockMs() - start,
    });
  }

  private errorResponse(
    request: ApiRequest,
    status: number,
    code: string,
    message: string,
    start: number,
    details?: Record<string, unknown>
  ): ApiResponse {
    return {
      status,
      headers: {
        ...defaultHeaders(request.version),
        "x-request-id": request.requestId,
      },
      body: serializeError(code, message, details),
      requestId: request.requestId,
      version: request.version,
      durationMs: this.clockMs() - start,
    };
  }
}

function extractCredential(request: ApiRequest): Result<AuthCredential> {
  const auth = request.headers["authorization"] ?? request.headers["Authorization"];
  const apiKey = request.headers["x-api-key"] ?? request.headers["X-Api-Key"];
  if (apiKey) {
    return success({ scheme: "api_key", token: apiKey });
  }
  if (!auth) {
    return failure(new AuthorizationError("missing authorization"));
  }
  const [type, token] = auth.split(" ");
  if (!token) return failure(new AuthorizationError("malformed authorization header"));
  if (type?.toLowerCase() === "bearer") {
    if (token.startsWith("oauth_")) return success({ scheme: "oauth", token });
    if (token.startsWith("session_")) return success({ scheme: "session", token });
    if (token.startsWith("service_")) return success({ scheme: "service_account", token });
    return success({ scheme: "jwt", token });
  }
  return failure(new AuthorizationError("unsupported authorization scheme"));
}

function statusForError(code: string): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "AUTHORIZATION_ERROR":
      return 403;
    case "RATE_LIMIT_ERROR":
      return 429;
    case "VALIDATION_ERROR":
      return 400;
    default:
      return 500;
  }
}
