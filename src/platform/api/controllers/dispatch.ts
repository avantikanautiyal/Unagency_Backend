/**
 * Controllers — thin adapters from HTTP routes to services.
 */

import { success, failure, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
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
import { evaluateReadiness } from "../runtime/readiness";
import { resolveEnterpriseApiExecutionMode } from "../runtime/execution-mode";
import { parseProductMode } from "../../os/contracts/product-mode";
import { getEnterpriseApiRuntime } from "../runtime/bootstrap-enterprise-api";

export interface ControllerDeps {
  readonly auth: IAuthenticationService;
  readonly tenants: ITenantService;
  readonly executions: IExecutionApiService;
  readonly streaming: IStreamingService;
  readonly catalog: ICatalogApiService;
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
  if (params.organizationId && request.method === "GET" && routeId.includes("_admin_organizations_")) {
    const roles = principal?.roles ?? [];
    const { buildAdminOrganizationDetail } = await import(
      "../services/admin-organizations-service"
    );
    const { buildAdminBillingSummary, resolveAdminMetricsFilter } = await import(
      "../services/admin-billing-analytics-service"
    );
    // Resolve org first (handles display suffixes), then bill only that org.
    const resolved = await buildAdminOrganizationDetail({
      lookupId: params.organizationId,
      billingByOrganization: [],
    });
    if (!resolved) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Organization not found" } };
    }
    const filter = resolveAdminMetricsFilter({
      roles,
      tenantOrganizationId: tenant?.organizationId,
      queryOrganizationId: resolved.organizationId,
      period: "mtd",
    });
    const billing = await buildAdminBillingSummary(filter);
    return success({
      ...resolved,
      revenueMtd: billing.revenue,
      aiCostMtd: billing.aiCost,
      humanCostMtd: billing.humanCost,
    });
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

  // Executable runtime truth — must run before catalogue /capabilities match.
  if (routeId.includes("_runtime_capabilities")) {
    const runtime = getEnterpriseApiRuntime();
    const mode = runtime?.executionMode ?? resolveEnterpriseApiExecutionMode({});
    const { listRuntimeCapabilities } = await import(
      "../services/runtime-capabilities-service"
    );
    return success(listRuntimeCapabilities(mode));
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
    const modeSource = {
      ...metadata,
      ...(body.productMode ? { productMode: body.productMode } : {}),
      ...(body.creationMode ? { creationMode: body.creationMode } : {}),
    };
    const explicitProductMode = parseProductMode(modeSource);
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
      ...(body.providerPinPolicy === "required" ||
      body.providerPinPolicy === "preferred"
        ? { providerPinPolicy: body.providerPinPolicy }
        : {}),
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
        ...(explicitProductMode
          ? { productMode: explicitProductMode, creationMode: explicitProductMode }
          : {}),
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
  if (routeId.includes("_artifacts_bundles") && request.method === "POST" && tenant) {
    const delivery =
      getEnterpriseApiRuntime()?.platform.durableStores?.asyncMedia?.mediaDelivery;
    if (!delivery) {
      return failure(new ValidationError("Media delivery unavailable"));
    }
    const items = (Array.isArray(body.items) ? body.items : []).flatMap((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      const artifactId = String(item.artifactId ?? "").trim();
      if (!artifactId || artifactId.startsWith("cdfart_")) return [];
      const name = String(item.name ?? "").trim() || artifactId;
      return [{ artifactId, name }];
    });
    if (items.length === 0) {
      return failure(new ValidationError("items must include at least one art_* artifactId"));
    }
    const formats = (Array.isArray(body.formats) ? body.formats : [])
      .map((f) => String(f).trim().toLowerCase())
      .filter((f): f is "png" | "jpg" | "pdf" => f === "png" || f === "jpg" || f === "pdf");
    return delivery.createArtifactBundleUrl({
      organizationId: tenant.organizationId,
      bundleName: String(body.name ?? "").trim() || "download",
      items,
      ...(formats.length ? { formats } : {}),
      ...(typeof body.readme === "string" && body.readme.trim()
        ? { readme: body.readme }
        : {}),
      publicOrigin: publicOriginFromRequest(request),
    });
  }

  if (params.artifactId && routeId.includes("_artifacts_") && routeId.includes("_content")) {
    const apiRuntime = getEnterpriseApiRuntime();
    const delivery = apiRuntime?.platform.durableStores?.asyncMedia?.mediaDelivery;
    const token = String(request.query?.token ?? "").trim();
    const formatRaw = request.query?.format;
    const format =
      typeof formatRaw === "string" && formatRaw.trim()
        ? formatRaw.trim()
        : undefined;
    if (!delivery) {
      return failure(new ValidationError("Media delivery unavailable"));
    }
    if (!token) {
      return failure(new ValidationError("token query parameter is required"));
    }
    return delivery.resolveArtifactBinaryByToken(params.artifactId, token, {
      ...(format ? { format } : {}),
    });
  }

  if (params.artifactId && routeId.includes("_artifacts_") && routeId.includes("_media") && tenant) {
    const apiRuntime = getEnterpriseApiRuntime();
    const delivery = apiRuntime?.platform.durableStores?.asyncMedia?.mediaDelivery;
    if (delivery) {
      const formatRaw = request.query?.format;
      const format =
        typeof formatRaw === "string" && formatRaw.trim()
          ? formatRaw.trim()
          : undefined;
      return delivery.resolveArtifactMediaUrl(params.artifactId, tenant.organizationId, {
        publicOrigin: publicOriginFromRequest(request),
        ...(format ? { format } : {}),
        preferSameOrigin:
          request.query?.proxy === '1' || request.query?.proxy === 'true',
      });
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
    if (routeId.includes("_cost")) {
      return await deps.executions.cost(execId, tenant);
    }
    if (routeId.includes("_evaluation")) return await deps.executions.evaluation(execId, tenant);
    if (routeId.includes("_experience")) return await deps.executions.experience(execId, tenant);
    if (routeId.includes("_workflow-follow-up") && routeId.includes("_consume")) {
      return deps.executions.consumeWorkflowFollowUp(execId, tenant);
    }
    if (routeId.includes("_workflow-follow-up")) {
      return deps.executions.getWorkflowFollowUp(execId, tenant);
    }
    if (routeId.includes("_auto-delivery")) {
      return deps.executions.getAutoDelivery(execId, tenant);
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
    const durableStores = getEnterpriseApiRuntime()?.platform.durableStores;
    return success(
      await evaluateReadiness({
        executionMode: mode,
        durableStores,
        asyncMedia: durableStores?.asyncMedia,
      })
    );
  }
  if (routeId.includes("_benchmarks")) {
    const { benchmarksApiPayload } = await import(
      "../../providers/routing/performance/benchmark/performance-query-service"
    );
    return success(benchmarksApiPayload());
  }
  if (routeId.includes("_analytics")) {
    const roles = principal?.roles ?? [];
    const { buildAdminAnalyticsSummary, resolveAdminMetricsFilter } = await import(
      "../services/admin-billing-analytics-service"
    );
    const { EnterpriseOsHumanReview } = await import(
      "../../infrastructure/durability/repositories/mongo-os-ledgers"
    );
    const q = request.query ?? {};
    const filter = resolveAdminMetricsFilter({
      roles,
      tenantOrganizationId: tenant?.organizationId,
      queryOrganizationId:
        typeof q.organizationId === "string" ? q.organizationId : undefined,
      period: typeof q.period === "string" ? q.period : undefined,
    });
    const pendingFilter: Record<string, unknown> = { status: "PENDING" };
    if (!filter.crossTenant) {
      if (!filter.organizationId) {
        return success(await buildAdminAnalyticsSummary(filter, 0));
      }
      pendingFilter.organizationId = filter.organizationId;
    }
    const openEscalations = await EnterpriseOsHumanReview.countDocuments(pendingFilter).catch(
      () => 0
    );
    const summary = await buildAdminAnalyticsSummary(filter, openEscalations);
    return success(summary);
  }
  if (routeId.includes("_admin_ai-costs_overview")) {
    const roles = principal?.roles ?? [];
    const q = request.query ?? {};
    const { buildAdminAiCostsOverview } = await import("../services/admin-ai-costs-service");
    const payload = await buildAdminAiCostsOverview({
      roles,
      tenantOrganizationId: tenant?.organizationId,
      queryOrganizationId: typeof q.organizationId === "string" ? q.organizationId : undefined,
      period: typeof q.period === "string" ? q.period : undefined,
      start: typeof q.start === "string" ? q.start : undefined,
      end: typeof q.end === "string" ? q.end : undefined,
    });
    return success(payload);
  }
  if (routeId.includes("_admin_ai-costs_providers")) {
    const roles = principal?.roles ?? [];
    const q = request.query ?? {};
    const { buildAdminAiCostsByProvider } = await import("../services/admin-ai-costs-service");
    const payload = await buildAdminAiCostsByProvider({
      roles,
      tenantOrganizationId: tenant?.organizationId,
      queryOrganizationId: typeof q.organizationId === "string" ? q.organizationId : undefined,
      period: typeof q.period === "string" ? q.period : undefined,
      start: typeof q.start === "string" ? q.start : undefined,
      end: typeof q.end === "string" ? q.end : undefined,
    });
    return success(payload);
  }
  if (routeId.includes("_admin_ai-costs_models")) {
    const roles = principal?.roles ?? [];
    const q = request.query ?? {};
    const { buildAdminAiCostsByModel } = await import("../services/admin-ai-costs-service");
    const payload = await buildAdminAiCostsByModel({
      roles,
      tenantOrganizationId: tenant?.organizationId,
      queryOrganizationId: typeof q.organizationId === "string" ? q.organizationId : undefined,
      period: typeof q.period === "string" ? q.period : undefined,
      start: typeof q.start === "string" ? q.start : undefined,
      end: typeof q.end === "string" ? q.end : undefined,
    });
    return success(payload);
  }
  if (routeId.includes("_admin_ai-costs_services")) {
    const roles = principal?.roles ?? [];
    const q = request.query ?? {};
    const { buildAdminAiCostsByService } = await import("../services/admin-ai-costs-service");
    const payload = await buildAdminAiCostsByService({
      roles,
      tenantOrganizationId: tenant?.organizationId,
      queryOrganizationId: typeof q.organizationId === "string" ? q.organizationId : undefined,
      period: typeof q.period === "string" ? q.period : undefined,
      start: typeof q.start === "string" ? q.start : undefined,
      end: typeof q.end === "string" ? q.end : undefined,
    });
    return success(payload);
  }
  if (routeId.includes("_admin_ai-costs_executions_") && params.executionId) {
    const { buildAdminAiCostsForExecution } = await import("../services/admin-ai-costs-service");
    const payload = await buildAdminAiCostsForExecution(params.executionId);
    return success(payload);
  }
  if (routeId.includes("_admin_ai-costs_usage_") && params.usageRecordId) {
    const { buildAdminAiCostsForUsageRecord } = await import("../services/admin-ai-costs-service");
    const payload = await buildAdminAiCostsForUsageRecord(params.usageRecordId);
    if (!payload) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Usage record not found" } };
    }
    return success(payload);
  }
  if (routeId.includes("_admin_ai-costs_sync-provider-billing")) {
    const { syncAdminProviderBilling } = await import("../services/admin-ai-costs-service");
    const body = (request.body ?? {}) as Record<string, unknown>;
    const payload = await syncAdminProviderBilling({
      start: typeof body.start === "string" ? body.start : undefined,
      end: typeof body.end === "string" ? body.end : undefined,
      days: typeof body.days === "number" ? body.days : undefined,
    });
    return success(payload);
  }
  if (routeId.includes("_admin_provider-health")) {
    const apiRuntime = getEnterpriseApiRuntime();
    const runtime = apiRuntime?.platform.toolRuntime?.runtime;
    if (!runtime || typeof runtime.getProviderHealthSnapshots !== "function") {
      return success({
        providers: [],
        note: "provider runtime not available in this process",
        timestamp: new Date().toISOString(),
      });
    }
    return success({
      providers: runtime.getProviderHealthSnapshots(),
      timestamp: new Date().toISOString(),
    });
  }
  if (routeId.includes("_admin_dashboard")) {
    const roles = principal?.roles ?? [];
    const { buildAdminDashboard } = await import("../services/admin-dashboard-service");
    const q = request.query ?? {};
    const payload = await buildAdminDashboard({
      roles,
      period: typeof q.period === "string" ? q.period : undefined,
      tenantOrganizationId: tenant?.organizationId,
    });
    return success(payload);
  }
  if (routeId.includes("_admin_organizations") && !params.organizationId) {
    const roles = principal?.roles ?? [];
    const { buildAdminOrganizationsList } = await import(
      "../services/admin-organizations-service"
    );
    const { buildAdminBillingSummary, resolveAdminMetricsFilter } = await import(
      "../services/admin-billing-analytics-service"
    );
    const q = request.query ?? {};
    const filter = resolveAdminMetricsFilter({
      roles,
      tenantOrganizationId: tenant?.organizationId,
      queryOrganizationId:
        typeof q.organizationId === "string" ? q.organizationId : undefined,
      period: "mtd",
    });
    const billing = await buildAdminBillingSummary(filter);
    const rows = await buildAdminOrganizationsList({
      roles,
      billingByOrganization: billing.byOrganization,
    });
    return success(rows);
  }
  if (routeId.includes("_billing")) {
    const roles = principal?.roles ?? [];
    const { buildAdminBillingSummary, resolveAdminMetricsFilter } = await import(
      "../services/admin-billing-analytics-service"
    );
    const q = request.query ?? {};
    const filter = resolveAdminMetricsFilter({
      roles,
      tenantOrganizationId: tenant?.organizationId,
      queryOrganizationId:
        typeof q.organizationId === "string" ? q.organizationId : undefined,
      period: typeof q.period === "string" ? q.period : "mtd",
    });
    const summary = await buildAdminBillingSummary(filter);
    return success({
      organizationId: filter.organizationId ?? tenant?.organizationId,
      period: summary.period,
      amount: summary.revenue,
      currency: summary.currency,
      revenue: summary.revenue,
      totalCost: summary.totalCost,
      humanCost: summary.humanCost,
      aiCost: summary.aiCost,
      profit: summary.profit,
      profitMargin: summary.profitMargin,
      monthlyTrend: summary.monthlyTrend,
      costByProvider: summary.costByProvider,
      byOrganization: summary.byOrganization,
      aiCostUsd: summary.aiCostUsd,
      aiCostProviderReportedUsd: summary.aiCostProviderReportedUsd,
      aiCostEstimatedUsd: summary.aiCostEstimatedUsd,
      usdToInrRate: summary.usdToInrRate,
      lastProviderReconciliationAt: summary.lastProviderReconciliationAt,
      providerDataThrough: summary.providerDataThrough,
    });
  }
  if (routeId.includes("_notifications")) return success([]);
  if (routeId.includes("_audit")) {
    const roles = principal?.roles ?? [];
    const crossTenant =
      roles.includes("admin") ||
      (roles.includes("owner") && !tenant?.organizationId);
    const decided = await deps.executions.listOsReviews(
      tenant,
      { status: "ALL", limit: 200 },
      { crossTenant }
    );
    const allRows = decided.ok && Array.isArray(decided.value) ? decided.value : [];
    const audit = allRows
      .filter((r) => (r as { status?: string }).status !== "PENDING")
      .map((r) => {
        const row = r as {
          reviewId?: string;
          reason?: string;
          status?: string;
          comments?: string;
          decidedAt?: string;
          requestedAt?: string;
          brand?: string;
        };
        return {
          auditId: row.reviewId,
          brand: row.brand ?? row.reason?.slice(0, 60) ?? "Creative review",
          note: row.comments ?? row.reason ?? "—",
          decision: row.status,
          status: row.status,
          createdAt: row.decidedAt ?? row.requestedAt,
          timestamp: row.decidedAt ?? row.requestedAt,
        };
      });
    return success(audit);
  }
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
  if (routeId.includes("_os_refinements") && tenant) {
    const idem =
      (request.headers["idempotency-key"] ??
        request.headers["x-idempotency-key"]) as string | undefined;
    if (request.method === "POST" && !params.refinementId) {
      return deps.executions.requestOsRefinement(tenant, body, idem);
    }
    if (params.refinementId && routeId.includes("_question")) {
      return deps.executions.getOsRefinementQuestion(params.refinementId, tenant);
    }
    if (params.refinementId && routeId.includes("_answers")) {
      return deps.executions.submitOsRefinementAnswer(
        params.refinementId,
        tenant,
        body,
        idem
      );
    }
    if (params.refinementId && routeId.includes("_complete")) {
      return deps.executions.completeOsRefinement(params.refinementId, tenant, idem);
    }
    if (params.refinementId) {
      return deps.executions.getOsRefinement(params.refinementId, tenant);
    }
  }

  if (routeId.includes("_os_artifacts") && tenant && params.artifactId) {
    if (
      request.method === "POST" &&
      routeId.includes("_approve") &&
      params.version
    ) {
      const version = Number(params.version);
      if (!Number.isFinite(version)) {
        return failure(new ValidationError("version must be a number"));
      }
      return deps.executions.approveOsArtifactVersion(
        params.artifactId,
        version,
        tenant,
        body
      );
    }
    if (routeId.includes("_versions") && request.method === "GET") {
      return deps.executions.listOsArtifactVersions(params.artifactId, tenant);
    }
    const versionRaw = request.query?.version;
    const version = versionRaw != null ? Number(versionRaw) : undefined;
    return deps.executions.getOsArtifact(
      params.artifactId,
      tenant,
      Number.isFinite(version) ? version : undefined
    );
  }

  if (routeId.includes("_os_deliveries") && tenant) {
    const idem =
      (request.headers["idempotency-key"] ??
        request.headers["x-idempotency-key"]) as string | undefined;
    if (routeId.includes("_authorize")) {
      return deps.executions.authorizeOsDelivery(tenant, body);
    }
    if (params.deliveryId && routeId.includes("_cancel")) {
      return deps.executions.cancelOsDelivery(params.deliveryId, tenant);
    }
    if (params.deliveryId && request.method === "GET") {
      return deps.executions.getOsDelivery(params.deliveryId, tenant);
    }
    if (request.method === "POST") {
      return deps.executions.createOsDelivery(tenant, body, idem);
    }
  }

  if (routeId.includes("_cdf_brief-gate") && request.method === "POST" && tenant) {
    const { evaluateCdfBriefGate } = await import("../../cdf/brief-gate");
    const str = (value: unknown): string | undefined =>
      typeof value === "string" && value.trim() ? value.trim() : undefined;
    return success(
      await evaluateCdfBriefGate({
        request: {
          text: String(body.text ?? ""),
          serviceId: str(body.serviceId),
          service: str(body.service),
          platform: str(body.platform),
          subtype: str(body.subtype),
          category: str(body.category),
        },
        organizationId: tenant.organizationId,
        integration: getEnterpriseApiRuntime()?.platform.integrationEngine,
      }),
    );
  }

  if (routeId.includes("_cdf_") && tenant) {
    const {
      getCdfSessionResult,
      listCdfServiceIds,
      resolveCdfServiceConfig,
      CDF_CONFIG_BY_ID,
      ensureCdfSessionLoaded,
      persistCdfSession,
    } = await import("../../cdf");

    if (routeId.includes("_cdf_services") && request.method === "GET") {
      if (params.serviceId) {
        const config = resolveCdfServiceConfig(params.serviceId);
        if (!config) {
          return failure(new ValidationError(`Unknown CDF service: ${params.serviceId}`));
        }
        return success(config);
      }
      return success({
        serviceIds: listCdfServiceIds(),
        services: Object.values(CDF_CONFIG_BY_ID).map((c) => ({
          serviceId: c.serviceId,
          service: c.service,
          outputMapService: c.outputMapService,
          phaseIds: c.phases.map((p) => p.id),
          studioHandoffAfterPhaseId: c.studioHandoffAfterPhaseId,
        })),
      });
    }

    if (routeId.includes("_cdf_sessions") && request.method === "POST") {
      const { executeCdfActionAsync } = await import(
        "../../cdf/state-machine/execute-action"
      );
      const started = await executeCdfActionAsync({
        action: "start",
        serviceId: String(body.serviceId ?? ""),
        productMode: body.productMode as "ai" | "hybrid" | "human" | undefined,
        projectId: body.projectId ? String(body.projectId) : undefined,
        contractVersion: body.contractVersion
          ? String(body.contractVersion)
          : undefined,
        requestId: body.requestId
          ? String(body.requestId)
          : ((request.headers["idempotency-key"] ??
              request.headers["x-idempotency-key"]) as string | undefined),
        organizationId: tenant.organizationId,
        workspaceId: tenant.workspaceId,
        userId: principal?.principalId,
      });
      if (started.ok) {
        try {
          await persistCdfSession(started.value.session);
        } catch (err) {
          return failure(
            err instanceof ValidationError
              ? err
              : new ValidationError(
                  err instanceof Error ? err.message : String(err),
                  { reason: "CDF_SESSION_DURABILITY_FAILED" },
                ),
          );
        }
      }
      return started;
    }

    if (routeId.includes("_cdf_sessions") && params.sessionId && request.method === "GET") {
      await ensureCdfSessionLoaded(params.sessionId);
      return getCdfSessionResult(params.sessionId);
    }

    if (routeId.includes("_cdf_transition") && request.method === "POST") {
      const sessionId = body.sessionId ? String(body.sessionId) : undefined;
      if (sessionId) {
        await ensureCdfSessionLoaded(sessionId);
      }
      const {
        executeCdfActionAsync,
      } = await import("../../cdf/state-machine/execute-action");
      const transitioned = await executeCdfActionAsync({
        sessionId,
        serviceId: body.serviceId ? String(body.serviceId) : undefined,
        action: body.action as never,
        brief: body.brief ? String(body.brief) : undefined,
        phaseId: body.phaseId ? String(body.phaseId) : undefined,
        routeIndex:
          body.routeIndex != null && Number.isFinite(Number(body.routeIndex))
            ? Number(body.routeIndex)
            : undefined,
        choiceId: body.choiceId ? String(body.choiceId) : undefined,
        routeTitle: body.routeTitle ? String(body.routeTitle) : undefined,
        routeLabel: body.routeLabel ? String(body.routeLabel) : undefined,
        routeDesc: body.routeDesc ? String(body.routeDesc) : undefined,
        routeInput: body.routeInput ? String(body.routeInput) : undefined,
        refinePrompt: body.refinePrompt ? String(body.refinePrompt) : undefined,
        refineScope: body.refineScope ? String(body.refineScope) : undefined,
        finalAction: body.finalAction ? String(body.finalAction) : undefined,
        finalActionId: body.finalActionId
          ? String(body.finalActionId)
          : undefined,
        artifactId: body.artifactId ? String(body.artifactId) : undefined,
        artifactVersion:
          body.artifactVersion != null &&
          Number.isFinite(Number(body.artifactVersion))
            ? Number(body.artifactVersion)
            : undefined,
        artifactKey: body.artifactKey ? String(body.artifactKey) : undefined,
        contextId: body.contextId ? String(body.contextId) : undefined,
        contextHash: body.contextHash ? String(body.contextHash) : undefined,
        executionId: body.executionId ? String(body.executionId) : undefined,
        note: body.note ? String(body.note) : undefined,
        projectId: body.projectId ? String(body.projectId) : undefined,
        productMode: body.productMode as "ai" | "hybrid" | "human" | undefined,
        platform: body.platform ? String(body.platform) : undefined,
        format: body.format ? String(body.format) : undefined,
        subtype: body.subtype ? String(body.subtype) : undefined,
        category: body.category ? String(body.category) : undefined,
        generationFanoutGroupId: body.generationFanoutGroupId
          ? String(body.generationFanoutGroupId)
          : undefined,
        generationFanoutTargetId: body.generationFanoutTargetId
          ? String(body.generationFanoutTargetId)
          : undefined,
        visualArtifactId: body.visualArtifactId
          ? String(body.visualArtifactId)
          : undefined,
        visualArtifactVersion:
          body.visualArtifactVersion != null &&
          Number.isFinite(Number(body.visualArtifactVersion))
            ? Number(body.visualArtifactVersion)
            : undefined,
        presentationEligibilityStatus: body.presentationEligibilityStatus
          ? String(body.presentationEligibilityStatus)
          : undefined,
        providerId: body.providerId ? String(body.providerId) : undefined,
        modelId: body.modelId ? String(body.modelId) : undefined,
        expectedVersion:
          body.expectedVersion != null &&
          Number.isFinite(Number(body.expectedVersion))
            ? Number(body.expectedVersion)
            : undefined,
        requestId: body.requestId
          ? String(body.requestId)
          : ((request.headers["idempotency-key"] ??
              request.headers["x-idempotency-key"]) as string | undefined),
        contractVersion: body.contractVersion
          ? String(body.contractVersion)
          : undefined,
        organizationId: tenant.organizationId,
        workspaceId: tenant.workspaceId,
        userId: principal?.principalId,
      });
      // CAS path already persists when mutating; start still needs durability.
      if (transitioned.ok) {
        try {
          await persistCdfSession(transitioned.value.session);
        } catch (err) {
          return failure(
            err instanceof ValidationError
              ? err
              : new ValidationError(
                  err instanceof Error ? err.message : String(err),
                  { reason: "CDF_SESSION_DURABILITY_FAILED" },
                ),
          );
        }
      }
      void import("../../../notifications/client-cdf-notifications").then(
        ({ notifyCdfTransition }) =>
          notifyCdfTransition({
            userId: principal?.userId ?? principal?.principalId,
            ok: transitioned.ok,
            errorMessage: transitioned.ok ? undefined : transitioned.error?.message,
            action: body.action ? String(body.action) : undefined,
            finalAction: body.finalAction ? String(body.finalAction) : undefined,
            finalActionId: body.finalActionId ? String(body.finalActionId) : undefined,
            refineScope: body.refineScope ? String(body.refineScope) : undefined,
            artifactId: body.artifactId ? String(body.artifactId) : undefined,
            artifactVersion:
              body.artifactVersion != null && Number.isFinite(Number(body.artifactVersion))
                ? Number(body.artifactVersion)
                : undefined,
            executionId: body.executionId ? String(body.executionId) : undefined,
            projectId: body.projectId
              ? String(body.projectId)
              : transitioned.ok
                ? transitioned.value.session.projectId
                : undefined,
            sessionId,
            requestId: body.requestId ? String(body.requestId) : undefined,
          }),
        () => undefined,
      );
      return transitioned;
    }

    if (
      routeId.includes("_cdf_artifacts_") &&
      routeId.includes("_render") &&
      request.method === "POST" &&
      params.artifactId &&
      params.version
    ) {
      const {
        httpRenderArtifact,
        CdfRenderError,
        createMediaFileVaultAssetResolver,
        getDefaultVaultAssetResolver,
        setDefaultVaultAssetResolver,
      } = await import("../../cdf/rendering");
      // Fail-closed durability: ensure MediaFile→blob resolver is bound for render.
      if (!getDefaultVaultAssetResolver()) {
        try {
          const { getProductAssetBlobStorage } = await import(
            "../../../services/product-asset-storage"
          );
          const asyncMedia =
            getEnterpriseApiRuntime()?.platform.durableStores?.asyncMedia;
          const primary =
            asyncMedia?.blobStorage ?? getProductAssetBlobStorage();
          const product = getProductAssetBlobStorage();
          setDefaultVaultAssetResolver(
            createMediaFileVaultAssetResolver({
              blobStorage: primary,
              fallbackBlobStorage: product !== primary ? product : undefined,
            }),
          );
        } catch {
          // renderArtifact fails closed with ASSET_NOT_FOUND if still unset
        }
      }
      try {
        const file = await httpRenderArtifact({
          artifactId: String(params.artifactId),
          artifactVersion: Number(params.version),
          body: {
            format: body.format as never,
            purpose: body.purpose as never,
            options: body.options as never,
            rendererVersion: body.rendererVersion
              ? String(body.rendererVersion)
              : undefined,
            requestId: body.requestId
              ? String(body.requestId)
              : ((request.headers["idempotency-key"] ??
                  request.headers["x-idempotency-key"]) as string | undefined),
            artifactKey: body.artifactKey
              ? String(body.artifactKey)
              : undefined,
          },
          organizationId: tenant.organizationId,
          workspaceId: tenant.workspaceId,
          projectId: body.projectId ? String(body.projectId) : undefined,
          deps: {
            vaultAssetResolver: getDefaultVaultAssetResolver(),
          },
        });
        return success({
          ...file,
          /** Compatibility aliases — FE still may look for media art_* elsewhere. */
          renderedFileId: file.fileId,
          downloadPath: `/v1/cdf/rendered-files/${file.fileId}/content`,
        });
      } catch (err) {
        if (err instanceof CdfRenderError) {
          return failure(err);
        }
        throw err;
      }
    }

    if (
      routeId.includes("_cdf_rendered-files_") &&
      params.fileId &&
      request.method === "GET"
    ) {
      const {
        httpGetRenderedFile,
        httpGetRenderedFileBytes,
        CdfRenderError,
      } = await import("../../cdf/rendering");
      try {
        if (routeId.includes("_content")) {
          const { file, bytes } = await httpGetRenderedFileBytes({
            fileId: String(params.fileId),
            organizationId: tenant.organizationId,
          });
          return success({
            fileId: file.fileId,
            mimeType: file.mimeType,
            checksum: file.checksum,
            byteLength: file.byteLength,
            artifactId: file.artifactId,
            artifactVersion: file.artifactVersion,
            /** Base64 payload for gateway streaming adapters. */
            contentBase64: Buffer.from(bytes).toString("base64"),
          });
        }
        const file = httpGetRenderedFile({
          fileId: String(params.fileId),
          organizationId: tenant.organizationId,
        });
        return success(file);
      } catch (err) {
        if (err instanceof CdfRenderError) {
          return failure(err);
        }
        throw err;
      }
    }
  }

  if (routeId.includes("_os_reviews") && tenant) {
    const idem =
      (request.headers["idempotency-key"] ??
        request.headers["x-idempotency-key"]) as string | undefined;
    if (params.reviewId && routeId.includes("_decision")) {
      const executionId = String(body.executionId ?? "");
      return deps.executions.submitHumanReviewDecision(executionId, tenant, {
        reviewId: params.reviewId,
        decision: body.decision as "APPROVED" | "REJECTED" | "REQUEST_CHANGES",
        reviewer: String(body.reviewer ?? principal?.principalId ?? "reviewer"),
        comments: body.comments ? String(body.comments) : undefined,
      });
    }
    if (params.reviewId) {
      return deps.executions.getOsReview(params.reviewId, tenant);
    }
    void idem;
  }

  if (routeId.includes("_os_executions") && params.executionId && tenant) {
    if (routeId.includes("_manifest")) {
      return deps.executions.getOsManifest(params.executionId, tenant);
    }
    if (routeId.includes("_review")) {
      return deps.executions.getOsPendingReview(params.executionId, tenant);
    }
  }

  if (routeId.includes("_reviews") && !routeId.includes("_os_")) {
    const roles = principal?.roles ?? [];
    const crossTenant =
      roles.includes("admin") ||
      (roles.includes("owner") && !tenant?.organizationId);
    const status =
      typeof request.query?.status === "string"
        ? request.query.status
        : "PENDING";
    const limitRaw = request.query?.limit;
    const limit =
      typeof limitRaw === "string" || typeof limitRaw === "number"
        ? Number(limitRaw)
        : undefined;
    return deps.executions.listOsReviews(
      tenant,
      { status, limit },
      { crossTenant }
    );
  }

  if (routeId.includes("_webhooks") && request.method === "POST") {
    return success({
      webhookId: `wh_${Date.now()}`,
      organizationId: tenant?.organizationId,
      url: String(body.url ?? ""),
      events: (body.events as string[]) ?? ["execution.completed"],
      active: true,
    });
  }
  if (routeId.includes("_brand-profiles")) {
    try {
      const mongooseNs = await import("mongoose");
      const mongoose = (mongooseNs as { default?: typeof mongooseNs }).default ?? mongooseNs;
      if (mongoose.connection?.readyState !== 1) return success([]);
      const organizationId = tenant?.organizationId ?? principal?.organizationId;
      if (!organizationId || !mongoose.isValidObjectId(organizationId)) return success([]);
      const Brands = (await import("../../../models/brand.model")).default;
      const { toBrandDto } = await import("../../../services/brand-service");
      const docs = await Brands.find({ organizationId: new mongoose.Types.ObjectId(organizationId) }).lean();
      const profiles = docs.map((doc: typeof docs[0]) => {
        const dto = toBrandDto(doc as Parameters<typeof toBrandDto>[0]);
        const gp = (dto.guidelinesProfile ?? {}) as Record<string, unknown>;
        return {
          id: dto.id,
          organizationId: dto.organizationId,
          name: dto.name,
          industry: dto.industry ?? null,
          voice: dto.voice ?? null,
          positioning: dto.positioning ?? null,
          guidelines: dto.guidelines ?? null,
          targetAudience: dto.targetAudience ?? null,
          website: dto.website ?? null,
          colors: dto.colors ?? [],
          logoAssetId: dto.logoAssetId ?? null,
          tone: gp.tone ?? null,
          personality: gp.brandPersonality ?? null,
          writingStyle: gp.writingStyle ?? null,
          completeness: computeBrandCompleteness(dto),
          createdAt: dto.createdAt ?? null,
          updatedAt: dto.updatedAt ?? null,
        };
      });
      return success(profiles);
    } catch {
      return success([]);
    }
  }

  if (routeId.includes("_knowledge-bases")) {
    try {
      const mongooseNs = await import("mongoose");
      const mongoose = (mongooseNs as { default?: typeof mongooseNs }).default ?? mongooseNs;
      if (mongoose.connection?.readyState !== 1) return success([]);
      const organizationId = tenant?.organizationId ?? principal?.organizationId;
      if (!organizationId || !mongoose.isValidObjectId(organizationId)) return success([]);
      const q = request.query ?? {};
      const brandId = typeof q.brandId === "string" ? q.brandId : undefined;
      const { searchKnowledgeChunksDetailed } = await import(
        "../../../services/knowledge-document-index-service"
      );
      const hits = await searchKnowledgeChunksDetailed({
        organizationId,
        brandId,
        q: typeof q.q === "string" ? q.q : "",
        limit: q.limit ? Number(q.limit) : 20,
      });
      // Group by documentId to produce document-level knowledge base records.
      const byDoc = new Map<string, { documentId: string; brandId?: string; title: string; chunkCount: number; organizationId: string }>();
      for (const hit of hits) {
        const existing = byDoc.get(hit.documentId);
        if (existing) {
          existing.chunkCount += 1;
        } else {
          byDoc.set(hit.documentId, {
            documentId: hit.documentId,
            brandId: hit.brandId,
            title: hit.title,
            chunkCount: 1,
            organizationId: hit.organizationId,
          });
        }
      }
      return success(Array.from(byDoc.values()));
    } catch {
      return success([]);
    }
  }

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

function computeBrandCompleteness(dto: Record<string, unknown>): "COMPLETE" | "PARTIAL" | "EMPTY" {
  const fields = [dto.name, dto.voice, dto.positioning, dto.guidelines, dto.targetAudience];
  const filled = fields.filter((f) => typeof f === "string" && (f as string).trim().length > 0).length;
  if (filled === 0) return "EMPTY";
  if (filled >= 4) return "COMPLETE";
  return "PARTIAL";
}

/** Prefer proxy/host headers so Expo Image can hit the same origin as the API client. */
function publicOriginFromRequest(request: ApiRequest): string {
  const forwardedHost = request.headers["x-forwarded-host"]?.trim();
  const host = forwardedHost || request.headers.host?.trim();
  const proto =
    request.headers["x-forwarded-proto"]?.trim() ||
    (host?.includes("localhost") || host?.startsWith("127.") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return process.env.ENTERPRISE_PUBLIC_API_ORIGIN?.trim() || "http://127.0.0.1:4000";
}
