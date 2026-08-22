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
import { resolveProductMode } from "../../os/contracts/product-mode";
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
    const productMode = resolveProductMode({
      ...metadata,
      ...(body.productMode ? { productMode: body.productMode } : {}),
      ...(body.creationMode ? { creationMode: body.creationMode } : {}),
    });
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
        productMode,
        creationMode: productMode,
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
  if (params.artifactId && routeId.includes("_artifacts_") && routeId.includes("_content")) {
    const apiRuntime = getEnterpriseApiRuntime();
    const delivery = apiRuntime?.platform.durableStores?.asyncMedia?.mediaDelivery;
    const token = String(request.query?.token ?? "").trim();
    if (!delivery) {
      return failure(new ValidationError("Media delivery unavailable"));
    }
    if (!token) {
      return failure(new ValidationError("token query parameter is required"));
    }
    return delivery.resolveArtifactBinaryByToken(params.artifactId, token);
  }

  if (params.artifactId && routeId.includes("_artifacts_") && routeId.includes("_media") && tenant) {
    const apiRuntime = getEnterpriseApiRuntime();
    const delivery = apiRuntime?.platform.durableStores?.asyncMedia?.mediaDelivery;
    if (delivery) {
      return delivery.resolveArtifactMediaUrl(params.artifactId, tenant.organizationId, {
        publicOrigin: publicOriginFromRequest(request),
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
    if (routeId.includes("_cost-breakdown") && deps.executionIntelligence) {
      return deps.executionIntelligence.costBreakdown(execId, tenant);
    }
    if (routeId.includes("_cost") && !routeId.includes("cost-breakdown")) {
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
    const durableStores = getEnterpriseApiRuntime()?.platform.durableStores;
    return success(
      await evaluateReadiness({
        executionMode: mode,
        durableStores,
        asyncMedia: durableStores?.asyncMedia,
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
    if (routeId.includes("_versions")) {
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
    if (routeId.includes("_review") && !routeId.includes("task-graph")) {
      return deps.executions.getOsPendingReview(params.executionId, tenant);
    }
    if (
      routeId.includes("_plan") &&
      !routeId.includes("task-graph") &&
      !routeId.includes("_planning")
    ) {
      return deps.executions.getExecutionPlan(params.executionId, tenant);
    }
    if (routeId.includes("task-graph") && routeId.includes("_resume")) {
      return deps.executions.resumeTaskGraph(params.executionId, tenant);
    }
    if (routeId.includes("task-graph") && routeId.includes("_cancel")) {
      return deps.executions.cancelTaskGraph(
        params.executionId,
        tenant,
        body.reason ? String(body.reason) : undefined
      );
    }
    if (routeId.includes("task-graph") && request.method === "POST") {
      return deps.executions.executeTaskGraph(params.executionId, tenant, {
        maxConcurrency: body.maxConcurrency != null ? Number(body.maxConcurrency) : undefined,
        requestId: request.requestId,
      });
    }
    if (routeId.includes("task-graph") && request.method === "GET") {
      return deps.executions.getTaskGraphStatus(params.executionId, tenant);
    }
  }

  if (routeId.includes("_reviews") && !routeId.includes("_os_")) return success([]);
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
