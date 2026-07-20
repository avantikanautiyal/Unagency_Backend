/**
 * Controllers — thin adapters from HTTP routes to services.
 */

import { success, type Result } from "../../intelligence/shared/result";
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

export interface ControllerDeps {
  readonly auth: IAuthenticationService;
  readonly tenants: ITenantService;
  readonly executions: IExecutionApiService;
  readonly streaming: IStreamingService;
  readonly catalog: ICatalogApiService;
  readonly executionIntelligence?: IExecutionIntelligenceApiService;
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

  if (routeId.includes("_capabilities")) return deps.catalog.listCapabilities();
  if (routeId.includes("_providers") && !routeId.includes("executions")) {
    return deps.catalog.listProviders();
  }
  if (routeId.includes("_models")) {
    return (deps.catalog as CatalogApiService).listModels();
  }

  if (routeId.includes("_executions") && request.method === "POST" && !params.executionId) {
    const createReq: CreateExecutionRequest = {
      prompt: String(body.prompt ?? ""),
      organizationId: String(body.organizationId ?? principal?.organizationId ?? ""),
      workspaceId: body.workspaceId ? String(body.workspaceId) : principal?.workspaceId,
      capabilityId: body.capabilityId ? String(body.capabilityId) : undefined,
      budgetLimit: body.budgetLimit != null ? Number(body.budgetLimit) : undefined,
      tokenBudgetLimit:
        body.tokenBudgetLimit != null ? Number(body.tokenBudgetLimit) : undefined,
      stream: Boolean(body.stream),
      metadata: body.metadata as never,
    };
    return deps.executions.create(createReq, principal!);
  }
  if (routeId.includes("_executions") && request.method === "GET" && !params.executionId) {
    return deps.executions.history(tenant!, 50);
  }

  const execId = params.executionId;
  if (execId && tenant) {
    if (routeId.includes("_cancel")) return deps.executions.cancel(execId, tenant);
    if (routeId.includes("_retry")) return deps.executions.retry(execId, tenant);
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
    if (routeId.includes("_artifacts")) return deps.executions.artifacts(execId, tenant);
    if (routeId.includes("_diagnostics")) return deps.executions.diagnostics(execId, tenant);
    if (routeId.includes("_trace")) return deps.executions.trace(execId, tenant);
    if (routeId.includes("_cost-breakdown") && deps.executionIntelligence) {
      return deps.executionIntelligence.costBreakdown(execId, tenant);
    }
    if (routeId.includes("_cost") && !routeId.includes("cost-breakdown")) {
      return deps.executions.cost(execId, tenant);
    }
    if (routeId.includes("_evaluation")) return deps.executions.evaluation(execId, tenant);
    if (routeId.includes("_experience")) return deps.executions.experience(execId, tenant);

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

    if (request.method === "GET") return deps.executions.get(execId, tenant);
  }

  if (routeId.includes("_health")) {
    return success({
      status: "healthy",
      gateway: "enterprise-api",
      onlyEntryPoint: true,
    });
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

  return success({ ok: true, routeId });
}
