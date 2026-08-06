/**
 * Controllers — thin adapters from HTTP routes to services.
 */

import { success, failure, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import type {
  ApiRequest,
  AuthPrincipal,
  CreateExecutionRequest,
  TenantContext,
} from "../contracts";
import type {
  IAuthenticationService,
  ICatalogApiService,
  IExecutionApiService,
  IStreamingService,
  ITenantService,
} from "../interfaces";
import { CatalogApiService } from "../services/catalog-api-service";
import type { InMemoryTenantService } from "../tenants/in-memory-tenant-service";
import type { IExecutionIntelligenceApiService } from "../execution-intelligence";
import { evaluateReadiness } from "../runtime/readiness";
import { resolveEnterpriseApiExecutionMode } from "../runtime/execution-mode";
import { getEnterpriseApiRuntime } from "../runtime/bootstrap-enterprise-api";

export interface ControllerDeps {
  readonly auth: IAuthenticationService;
  readonly tenants: ITenantService;
  readonly executions: IExecutionApiService;
  readonly streaming: IStreamingService;
  readonly catalog: ICatalogApiService;
  readonly executionIntelligence?: IExecutionIntelligenceApiService;
  readonly currentPrincipal?: {
    getMe: (
      principal: AuthPrincipal | undefined
    ) => Promise<Result<unknown>>;
  };
}

export async function dispatchController(
  deps: ControllerDeps,
  routeId: string,
  request: ApiRequest,
  params: Record<string, string>,
  principal: AuthPrincipal | undefined,
  tenant: TenantContext | undefined
): Promise<Result<unknown>> {
  const body = (request.body ?? {}) as Record<string, unknown>;

  if (routeId.includes("auth_login")) {
    return deps.auth.login({
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      organizationId: String(body.organizationId ?? ""),
      deviceId: String(body.deviceId ?? "device_default"),
      scheme: (body.scheme as never) ?? "jwt",
    });
  }
  if (routeId.endsWith("_me") || routeId.includes("__me")) {
    if (!deps.currentPrincipal) {
      return failure(new ValidationError("current principal service unavailable"));
    }
    return deps.currentPrincipal.getMe(principal);
  }
  if (routeId.includes("auth_api-keys")) {
    return deps.auth.issueApiKey({
      organizationId: principal!.organizationId!,
      name: String(body.name ?? "default"),
      roles: (body.roles as never) ?? ["service"],
    });
  }

  if (routeId.includes("_organizations") && request.method === "POST" && !params.organizationId) {
    return deps.tenants.createOrganization(String(body.name ?? ""));
  }
  if (params.organizationId && request.method === "GET" && routeId.includes("organizations")) {
    return deps.tenants.getOrganization(params.organizationId);
  }
  if (routeId.endsWith("_workspaces") || routeId.includes("__v1_workspaces") || routeId.includes("__v2_workspaces")) {
    if (request.method === "POST") {
      return deps.tenants.createWorkspace(
        String(body.organizationId ?? principal?.organizationId ?? ""),
        String(body.name ?? "")
      );
    }
    return deps.tenants.listWorkspaces(
      String(request.query?.organizationId ?? principal?.organizationId ?? "")
    );
  }
  if (routeId.includes("_users") && request.method === "POST") {
    return deps.tenants.createUser({
      email: String(body.email ?? ""),
      displayName: String(body.displayName ?? ""),
      organizationId: String(body.organizationId ?? principal?.organizationId ?? ""),
      roles: (body.roles as never) ?? ["member"],
    });
  }
  if (routeId.includes("_projects") && request.method === "POST") {
    return (deps.tenants as InMemoryTenantService).createProject({
      organizationId: String(body.organizationId ?? principal?.organizationId ?? ""),
      workspaceId: String(body.workspaceId ?? ""),
      name: String(body.name ?? ""),
    });
  }

  // Executable runtime truth (M10.5) — must run before catalogue /capabilities match.
  if (routeId.includes("_intelligence_capabilities")) {
    const runtime = getEnterpriseApiRuntime();
    const mode = runtime?.executionMode ?? resolveEnterpriseApiExecutionMode({});
    const { listIntelligenceCapabilities } = await import(
      "../services/intelligence-capabilities-service"
    );
    return success(listIntelligenceCapabilities(mode));
  }
  if (routeId.includes("_capabilities")) return deps.catalog.listCapabilities();
  if (routeId.includes("_providers") && !routeId.includes("executions")) {
    return deps.catalog.listProviders();
  }
  if (routeId.includes("_models")) {
    return (deps.catalog as CatalogApiService).listModels();
  }

  if (routeId.includes("_executions") && request.method === "POST" && !params.executionId) {
    const metadata = (body.metadata ?? {}) as Record<string, unknown>;
    const toolNames = body.toolNames ?? metadata.toolNames;
    const structuredOutput = body.structuredOutput ?? metadata.structuredOutput;
    const createReq: CreateExecutionRequest = {
      prompt: String(body.prompt ?? ""),
      // Prefer body when present so spoof attempts fail AuthorizationError (403).
      // ExecutionApiService then binds the trusted principal.organizationId for Firebase.
      organizationId: String(body.organizationId ?? principal?.organizationId ?? ""),
      workspaceId: body.workspaceId
        ? String(body.workspaceId)
        : principal?.workspaceId,
      projectId: body.projectId ? String(body.projectId) : undefined,
      capabilityId: body.capabilityId ? String(body.capabilityId) : undefined,
      providerId: body.providerId ? String(body.providerId) : undefined,
      modelId: body.modelId ? String(body.modelId) : undefined,
      budgetLimit: body.budgetLimit != null ? Number(body.budgetLimit) : undefined,
      tokenBudgetLimit:
        body.tokenBudgetLimit != null ? Number(body.tokenBudgetLimit) : undefined,
      stream: Boolean(body.stream) || routeId.includes("_stream"),
      toolNames: Array.isArray(toolNames)
        ? toolNames.filter((name): name is string => typeof name === "string")
        : undefined,
      structuredOutput: structuredOutput as CreateExecutionRequest["structuredOutput"],
      metadata: {
        ...metadata,
        ...(toolNames !== undefined ? { toolNames } : {}),
        ...(structuredOutput !== undefined ? { structuredOutput } : {}),
      },
      idempotencyKey:
        (request.headers["idempotency-key"] ??
          request.headers["x-idempotency-key"]) as string | undefined,
    };
    // M10.8 — POST /v1/executions/stream → live SSE (not theatrical JSON stub).
    if (routeId.includes("_stream")) {
      if (!tenant) return failure(new ValidationError("tenant required"));
      return deps.executions.createStream(createReq, principal!, tenant);
    }
    return deps.executions.create(createReq, principal!);
  }
  if (routeId.includes("_executions") && request.method === "GET" && !params.executionId) {
    const q = request.query ?? {};
    const parseBool = (v: unknown): boolean | undefined => {
      if (v === "true") return true;
      if (v === "false") return false;
      return undefined;
    };
    const pageRaw = Number(q.page ?? 1);
    const limitRaw = Number(q.limit ?? 50);
    return deps.executions.history(tenant!, {
      page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
      limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50,
      status: typeof q.status === "string" ? q.status : undefined,
      q: typeof q.q === "string" ? q.q : undefined,
      sort: q.sort === "oldest" ? "oldest" : "newest",
      pinned: parseBool(q.pinned),
      favorite: parseBool(q.favorite),
      includeDeleted: q.includeDeleted === "true",
    });
  }
  if (params.artifactId && routeId.includes("_artifacts_") && routeId.includes("_media") && tenant) {
    const apiRuntime = getEnterpriseApiRuntime();
    const delivery = apiRuntime?.platform.durableStores?.asyncMedia?.mediaDelivery;
    if (delivery) {
      return delivery.resolveArtifactMediaUrl(params.artifactId, tenant.organizationId);
    }
    return failure(new ValidationError("Media delivery unavailable"));
  }

  const execId = params.executionId;
  if (execId && tenant) {
    if (routeId.includes("_cancel")) return deps.executions.cancel(execId, tenant);
    if (routeId.includes("_retry")) return deps.executions.retry(execId, tenant);
    if (routeId.includes("_delete") && routeId.includes("_executions")) {
      return deps.executions.softDelete(execId, tenant);
    }
    if (routeId.includes("_pin") && routeId.includes("_executions")) {
      return deps.executions.setPinned(execId, tenant, Boolean(body.pinned));
    }
    if (routeId.includes("_favorite") && routeId.includes("_executions")) {
      return deps.executions.setFavorite(execId, tenant, Boolean(body.favorite));
    }
    if (routeId.includes("_duplicate") && routeId.includes("_executions")) {
      return deps.executions.duplicate(execId, tenant);
    }
    if (routeId.includes("_tool-approvals")) {
      const decision = body.decision;
      if (decision !== "approve" && decision !== "reject") {
        return failure(new ValidationError("decision must be 'approve' or 'reject'"));
      }
      return deps.executions.decideToolApproval(
        execId,
        params.invocationId ?? "",
        decision,
        principal!,
        tenant
      );
    }
    if (routeId.includes("_stream")) {
      const sub = deps.streaming.subscribe(execId, "sse");
      if (!sub.ok) return sub;
      deps.streaming.push({
        subscriptionId: sub.value.subscriptionId,
        executionId: execId,
        kind: "status",
        payload: { status: "streaming" },
      });
      deps.streaming.push({
        subscriptionId: sub.value.subscriptionId,
        executionId: execId,
        kind: "chunk",
        payload: { text: "…" },
      });
      deps.streaming.push({
        subscriptionId: sub.value.subscriptionId,
        executionId: execId,
        kind: "done",
        payload: {},
      });
      const events = deps.streaming.poll(sub.value.subscriptionId);
      if (!events.ok) return events;
      return deps.streaming.toSse(events.value);
    }
    if (routeId.includes("_artifacts")) return await deps.executions.artifacts(execId, tenant);
    if (routeId.includes("_diagnostics")) return await deps.executions.diagnostics(execId, tenant);
    if (routeId.includes("_trace")) return await deps.executions.trace(execId, tenant);
    if (routeId.includes("_cost-breakdown") && deps.executionIntelligence) {
      return deps.executionIntelligence.costBreakdown(execId, tenant);
    }
    if (routeId.includes("_cost") && !routeId.includes("cost-breakdown")) {
      return await deps.executions.cost(execId, tenant);
    }
    if (routeId.includes("_evaluation")) return await deps.executions.evaluation(execId, tenant);
    if (routeId.includes("_experience")) return await deps.executions.experience(execId, tenant);

    if (deps.executionIntelligence && request.method === "GET") {
      if (routeId.includes("_model-decision")) {
        return deps.executionIntelligence.modelDecision(execId, tenant);
      }
      if (routeId.includes("_routing")) {
        return deps.executionIntelligence.routing(execId, tenant);
      }
      if (routeId.includes("_planning")) {
        return deps.executionIntelligence.planning(execId, tenant);
      }
      if (routeId.includes("_timeline")) {
        return deps.executionIntelligence.timeline(execId, tenant);
      }
      if (routeId.includes("_provider") && !routeId.includes("_providers")) {
        return deps.executionIntelligence.provider(execId, tenant);
      }
      if (routeId.includes("_metrics")) {
        return deps.executionIntelligence.metrics(execId, tenant);
      }
      if (routeId.includes("_tokens")) {
        return deps.executionIntelligence.tokens(execId, tenant);
      }
      if (routeId.includes("_quality")) {
        return deps.executionIntelligence.quality(execId, tenant);
      }
      if (routeId.includes("_confidence")) {
        return deps.executionIntelligence.confidence(execId, tenant);
      }
      if (routeId.includes("_audit") && routeId.includes("executions")) {
        return deps.executionIntelligence.audit(execId, tenant);
      }
      if (routeId.includes("_decision-graph")) {
        return deps.executionIntelligence.decisionGraph(execId, tenant);
      }
    }

    if (request.method === "GET") return await deps.executions.get(execId, tenant);
  }

  if (routeId.includes("_health")) {
    return success({
      status: "healthy",
      gateway: "enterprise-api",
      onlyEntryPoint: true,
    });
  }
  if (routeId.includes("_ready")) {
    const mode =
      getEnterpriseApiRuntime()?.executionMode ??
      resolveEnterpriseApiExecutionMode({});
    return success(
      await evaluateReadiness({
        executionMode: mode,
        durableStores: getEnterpriseApiRuntime()?.platform.durableStores,
      })
    );
  }
  if (routeId.includes("_benchmarks")) return success([]);
  if (routeId.includes("_analytics")) return success({ executions: 0, cost: 0 });
  if (routeId.includes("_billing")) {
    return success({
      organizationId: tenant?.organizationId,
      period: "current",
      amount: 0,
      currency: "USD",
    });
  }
  if (routeId.includes("_notifications")) return success([]);
  if (routeId.includes("_audit")) return success([]);
  if (routeId.includes("_files") && request.method === "POST") {
    return success({
      fileId: `file_${Date.now()}`,
      organizationId: tenant?.organizationId,
      name: String(body.name ?? "upload"),
      contentType: String(body.contentType ?? "application/octet-stream"),
      sizeBytes: Number(body.sizeBytes ?? 0),
      createdAt: new Date().toISOString(),
    });
  }
  if (routeId.includes("_files") && request.method === "GET") {
    return success({ fileId: params.fileId });
  }
  if (routeId.includes("_reviews")) return success([]);
  if (routeId.includes("_webhooks") && request.method === "POST") {
    return success({
      webhookId: `wh_${Date.now()}`,
      organizationId: tenant?.organizationId,
      url: String(body.url ?? ""),
      events: (body.events as string[]) ?? ["execution.completed"],
      active: true,
    });
  }
  if (routeId.includes("_brand-profiles")) return success([]);
  if (routeId.includes("_knowledge-bases")) return success([]);

  // M10.17 — Enterprise /v1/search* thin adapter over the same
  // ProductSearchService used by the legacy /search routes (no second
  // search engine).
  if (routeId.includes("_search")) {
    const { productSearchService } = await import(
      "../../../services/product-search-service"
    );
    const userId = principal?.userId ?? principal?.principalId ?? "";
    const organizationId = tenant?.organizationId ?? principal?.organizationId;
    const q = request.query ?? {};
    if (routeId.includes("_suggestions")) {
      return success(
        await productSearchService.suggestions({
          userId,
          organizationId,
          q: String(q.q ?? ""),
          limit: q.limit ? Number(q.limit) : undefined,
        })
      );
    }
    if (routeId.includes("_recent")) {
      if (request.method === "DELETE") {
        return success(
          await productSearchService.clearRecent({ userId, organizationId })
        );
      }
      return success(
        await productSearchService.listRecent({
          userId,
          organizationId,
          limit: q.limit ? Number(q.limit) : undefined,
        })
      );
    }
    const typesRaw = q.types;
    const types = typesRaw
      ? String(typesRaw)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    return success(
      await productSearchService.search({
        userId,
        organizationId,
        brandId: q.brandId,
        q: String(q.q ?? ""),
        types: types as never,
        page: q.page ? Number(q.page) : undefined,
        limit: q.limit ? Number(q.limit) : undefined,
        cursor: q.cursor,
      })
    );
  }

  return success({ ok: true, routeId });
}
