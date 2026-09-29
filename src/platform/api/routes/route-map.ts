/**
 * Canonical route map — /v1 and /v2 (v2 mirrors with future-compatible paths).
 */

import type { RouteDefinition } from "../contracts";
import type { RateLimitAccountingClass } from "../../execution-reliability/execution-outcome";

function v(
  version: "v1" | "v2",
  method: RouteDefinition["method"],
  path: string,
  domain: RouteDefinition["domain"],
  summary: string,
  permissions: RouteDefinition["permissions"],
  authRequired = true,
  rateLimitAccountingClass?: RateLimitAccountingClass
): RouteDefinition {
  return {
    routeId: `${version}_${method}_${path.replace(/\//g, "_")}`,
    version,
    method,
    path: `/${version}${path}`,
    domain,
    summary,
    authRequired,
    permissions,
    ...(rateLimitAccountingClass
      ? { rateLimitAccountingClass }
      : {}),
  };
}

/** Execution / session hydration polls — separate from USER_REQUEST bucket. */
const POLL: RateLimitAccountingClass = "BACKGROUND_POLL";

function routesFor(version: "v1" | "v2"): RouteDefinition[] {
  return [
    v(version, "GET", "/health", "health", "Gateway health", [], false),
    v(version, "GET", "/ready", "health", "Gateway readiness", [], false),
    v(version, "POST", "/auth/login", "authentication", "Login", [], false),
    v(version, "GET", "/me", "authentication", "Current authenticated principal", []),
    v(version, "POST", "/auth/api-keys", "authentication", "Issue API key", ["admin:*"]),
    v(version, "POST", "/organizations", "organizations", "Create organization", ["org:write"]),
    v(version, "GET", "/organizations/:organizationId", "organizations", "Get organization", ["org:read"]),
    v(version, "POST", "/workspaces", "workspaces", "Create workspace", ["workspace:write"]),
    v(version, "GET", "/workspaces", "workspaces", "List workspaces", ["workspace:read"]),
    v(version, "POST", "/users", "users", "Create user", ["org:write"]),
    v(version, "POST", "/projects", "projects", "Create project", ["workspace:write"]),
    v(version, "GET", "/capabilities", "capabilities", "List catalogue capabilities (marketing)", ["capability:read"]),
    v(version, "GET", "/runtime/capabilities", "capabilities", "List executable runtime capabilities (authoritative availability)", ["capability:read"]),
    v(version, "GET", "/providers", "providers", "Provider catalog", ["provider:read"]),
    v(version, "GET", "/models", "models", "Model catalog", ["provider:read"]),
    v(version, "POST", "/executions", "executions", "Create execution", ["execution:create"]),
    v(
      version,
      "POST",
      "/executions/stream",
      "executions",
      "Create execution and stream (SSE)",
      ["execution:create", "execution:stream"]
    ),
    v(version, "GET", "/executions", "executions", "Execution history", ["execution:read"]),
    v(version, "GET", "/executions/:executionId", "executions", "Get execution", ["execution:read"], true, POLL),
    v(version, "POST", "/executions/:executionId/cancel", "executions", "Cancel execution", ["execution:cancel"]),
    v(version, "POST", "/executions/:executionId/retry", "executions", "Retry execution", ["execution:retry"]),
    v(version, "POST", "/executions/:executionId/delete", "executions", "Soft delete execution", ["execution:cancel"]),
    v(version, "POST", "/executions/:executionId/pin", "executions", "Pin execution", ["execution:read"]),
    v(version, "POST", "/executions/:executionId/favorite", "executions", "Favorite execution", ["execution:read"]),
    v(version, "POST", "/executions/:executionId/duplicate", "executions", "Duplicate execution", ["execution:create"]),
    v(version, "POST", "/executions/:executionId/tool-approvals/:invocationId", "executions", "Decide tool approval", ["review:write"]),
    v(version, "GET", "/executions/:executionId/stream", "executions", "Stream execution", ["execution:stream"], true, POLL),
    v(version, "GET", "/executions/:executionId/artifacts", "executions", "Execution artifacts", ["execution:read"], true, POLL),
    v(version, "GET", "/artifacts/:artifactId/media", "executions", "Signed media URL for artifact", ["execution:read"], true, POLL),
    v(version, "POST", "/artifacts/bundles", "executions", "ZIP download bundle of artifacts (e.g. Logo Pack)", ["execution:read"]),
    // Tokenized byte stream for Expo Image (no Bearer header) — auth via short-lived query token.
    v(
      version,
      "GET",
      "/artifacts/:artifactId/content",
      "executions",
      "Stream artifact media bytes by ephemeral token",
      [],
      false,
      POLL
    ),
    v(version, "GET", "/executions/:executionId/diagnostics", "executions", "Execution diagnostics", ["execution:read"], true, POLL),
    v(version, "GET", "/executions/:executionId/trace", "executions", "Execution trace", ["execution:read"], true, POLL),
    v(version, "GET", "/executions/:executionId/cost", "executions", "Execution cost", ["execution:read"], true, POLL),
    v(version, "GET", "/executions/:executionId/evaluation", "executions", "Execution evaluation", ["execution:read"], true, POLL),
    v(version, "GET", "/executions/:executionId/experience", "executions", "Execution experience", ["execution:read"], true, POLL),
    v(version, "GET", "/executions/:executionId/workflow-follow-up", "executions", "Linked workflow follow-up", ["execution:read"], true, POLL),
    v(version, "POST", "/executions/:executionId/workflow-follow-up/consume", "executions", "Consume workflow follow-up", ["execution:create"]),
    v(version, "GET", "/executions/:executionId/auto-delivery", "executions", "Auto-delivery status", ["execution:read"], true, POLL),
    v(version, "GET", "/benchmarks", "benchmarks", "Benchmarks", ["benchmark:read"]),
    v(version, "GET", "/analytics/summary", "analytics", "Analytics summary", ["analytics:read"]),
    v(version, "GET", "/billing/summary", "billing", "Billing summary", ["billing:read"]),
    v(version, "GET", "/admin/provider-health", "analytics", "Provider circuit health snapshot (internal)", ["analytics:read"]),
    v(version, "GET", "/admin/dashboard", "analytics", "Admin dashboard bundle", ["analytics:read"]),
    v(version, "GET", "/admin/ai-costs/overview", "analytics", "AI cost overview (ledger)", ["analytics:read"]),
    v(version, "GET", "/admin/ai-costs/providers", "analytics", "AI cost by provider", ["analytics:read"]),
    v(version, "GET", "/admin/ai-costs/models", "analytics", "AI cost by model", ["analytics:read"]),
    v(version, "GET", "/admin/ai-costs/services", "analytics", "AI cost by service", ["analytics:read"]),
    v(version, "GET", "/admin/ai-costs/executions/:executionId", "analytics", "AI cost for execution", ["analytics:read"]),
    v(version, "GET", "/admin/ai-costs/usage/:usageRecordId", "analytics", "AI usage record detail", ["analytics:read"]),
    v(version, "POST", "/admin/ai-costs/sync-provider-billing", "analytics", "Sync OpenAI/Anthropic org cost APIs", ["analytics:read"]),
    v(version, "GET", "/admin/organizations", "organizations", "Admin organization directory", ["analytics:read"]),
    v(version, "GET", "/admin/organizations/:organizationId", "organizations", "Admin organization detail", ["analytics:read"]),
    v(version, "GET", "/notifications", "notifications", "List notifications", ["notification:read"]),
    v(version, "GET", "/audit", "audit", "Audit logs", ["audit:read"]),
    v(version, "POST", "/files", "files", "Upload file metadata", ["file:upload"]),
    v(version, "GET", "/files/:fileId", "files", "Get file", ["file:read"]),
    v(version, "GET", "/reviews", "human_reviews", "Human reviews", ["review:read"]),
    v(version, "POST", "/os/refinements", "refinement", "Request structured refinement", ["execution:create"]),
    v(version, "GET", "/os/refinements/:refinementId", "refinement", "Get refinement status", ["execution:read"], true, POLL),
    v(version, "GET", "/os/refinements/:refinementId/question", "refinement", "Get current refinement question", ["execution:read"], true, POLL),
    v(version, "POST", "/os/refinements/:refinementId/answers", "refinement", "Submit refinement answer", ["execution:create"]),
    v(version, "POST", "/os/refinements/:refinementId/complete", "refinement", "Complete refinement feedback", ["execution:create"]),
    v(version, "GET", "/os/artifacts/:artifactId", "os_artifacts", "Get OS artifact", ["execution:read"], true, POLL),
    v(version, "GET", "/os/artifacts/:artifactId/versions", "os_artifacts", "List OS artifact versions", ["execution:read"], true, POLL),
    v(version, "POST", "/os/artifacts/:artifactId/versions/:version/approve", "os_artifacts", "Approve OS artifact version (optional brandMemory)", ["execution:create"]),
    v(version, "GET", "/os/executions/:executionId/manifest", "os_artifacts", "Get artifact manifest", ["execution:read"], true, POLL),
    v(version, "POST", "/os/deliveries/authorize", "delivery", "Authorize delivery", ["execution:create"]),
    v(version, "POST", "/os/deliveries", "delivery", "Create delivery", ["execution:create"]),
    v(version, "GET", "/os/deliveries/:deliveryId", "delivery", "Get delivery status", ["execution:read"], true, POLL),
    v(version, "POST", "/os/deliveries/:deliveryId/cancel", "delivery", "Cancel delivery", ["execution:cancel"]),
    v(version, "GET", "/cdf/services", "cdf", "List CDF service flow configs", ["execution:read"]),
    v(version, "GET", "/cdf/services/:serviceId", "cdf", "Get CDF service flow config", ["execution:read"]),
    v(version, "POST", "/cdf/sessions", "cdf", "Start CDF session", ["execution:create"]),
    v(version, "GET", "/cdf/sessions/:sessionId", "cdf", "Get CDF session state", ["execution:read"], true, POLL),
    v(version, "POST", "/cdf/transition", "cdf", "Apply CDF stage transition", ["execution:create"]),
    v(
      version,
      "POST",
      "/cdf/artifacts/:artifactId/versions/:version/render",
      "cdf",
      "Render exact CDF artifact version to PPTX/PDF (canonical; no AI)",
      ["execution:create"],
    ),
    v(
      version,
      "GET",
      "/cdf/rendered-files/:fileId",
      "cdf",
      "Get CDF RenderedFile metadata",
      ["execution:read"],
      true,
      POLL,
    ),
    v(
      version,
      "GET",
      "/cdf/rendered-files/:fileId/content",
      "cdf",
      "Download CDF RenderedFile bytes",
      ["execution:read"],
      true,
      POLL,
    ),
    v(version, "GET", "/os/reviews/:reviewId", "human_reviews", "Get human review", ["review:read"], true, POLL),
    v(version, "POST", "/os/reviews/:reviewId/decision", "human_reviews", "Submit human review decision", ["review:write"]),
    v(version, "GET", "/os/executions/:executionId/review", "human_reviews", "Get pending review for execution", ["review:read"], true, POLL),
    v(version, "POST", "/webhooks", "webhooks", "Register webhook", ["org:write"]),
    v(version, "GET", "/brand-profiles", "brand_profiles", "Brand profiles", ["org:read"]),
    v(version, "GET", "/knowledge-bases", "knowledge_bases", "Knowledge bases", ["workspace:read"]),
    v(version, "GET", "/search", "search", "Global search (M10.17)", ["search:read"]),
    v(version, "GET", "/search/suggestions", "search", "Search suggestions", ["search:read"]),
    v(version, "GET", "/search/recent", "search", "Recent searches", ["search:read"]),
    v(version, "DELETE", "/search/recent", "search", "Clear recent searches", ["search:read"]),
  ];
}

export const API_ROUTE_MAP: readonly RouteDefinition[] = [
  ...routesFor("v1"),
  ...routesFor("v2"),
];

export function matchRoute(
  method: string,
  path: string
): { route: RouteDefinition; params: Record<string, string> } | undefined {
  for (const route of API_ROUTE_MAP) {
    if (route.method !== method) continue;
    const params = matchPath(route.path, path);
    if (params) return { route, params };
  }
  return undefined;
}

function matchPath(
  pattern: string,
  actual: string
): Record<string, string> | undefined {
  const pParts = pattern.split("/").filter(Boolean);
  const aParts = actual.split("/").filter(Boolean);
  if (pParts.length !== aParts.length) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < pParts.length; i++) {
    const p = pParts[i]!;
    const a = aParts[i]!;
    if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(a);
    else if (p !== a) return undefined;
  }
  return params;
}
