/**
 * Generates api/docs machine-readable artifacts from the canonical inventory.
 * Run: node api/docs/_generate-artifacts.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = __dirname;

/** @type {{ method: string, path: string, domain: string, summary: string, auth: boolean, permissions: string[], body?: object }[]} */
const gatewayPaths = [
  { method: "GET", path: "/health", domain: "health", summary: "Gateway health", auth: false, permissions: [] },
  { method: "POST", path: "/auth/login", domain: "authentication", summary: "Login", auth: false, permissions: [], body: { email: "string", password: "string", organizationId: "string", deviceId: "string", scheme: "jwt|oauth|session" } },
  { method: "POST", path: "/auth/api-keys", domain: "authentication", summary: "Issue API key", auth: true, permissions: ["admin:*"], body: { name: "string", roles: ["service"] } },
  { method: "POST", path: "/organizations", domain: "organizations", summary: "Create organization", auth: true, permissions: ["org:write"], body: { name: "string" } },
  { method: "GET", path: "/organizations/{organizationId}", domain: "organizations", summary: "Get organization", auth: true, permissions: ["org:read"] },
  { method: "POST", path: "/workspaces", domain: "workspaces", summary: "Create workspace", auth: true, permissions: ["workspace:write"], body: { organizationId: "string", name: "string" } },
  { method: "GET", path: "/workspaces", domain: "workspaces", summary: "List workspaces", auth: true, permissions: ["workspace:read"] },
  { method: "POST", path: "/users", domain: "users", summary: "Create user", auth: true, permissions: ["org:write"], body: { email: "string", displayName: "string", organizationId: "string", roles: ["member"] } },
  { method: "POST", path: "/projects", domain: "projects", summary: "Create project", auth: true, permissions: ["workspace:write"], body: { organizationId: "string", workspaceId: "string", name: "string" } },
  { method: "GET", path: "/capabilities", domain: "capabilities", summary: "List capabilities", auth: true, permissions: ["capability:read"] },
  { method: "GET", path: "/providers", domain: "providers", summary: "Provider catalog", auth: true, permissions: ["provider:read"] },
  { method: "GET", path: "/models", domain: "models", summary: "Model catalog", auth: true, permissions: ["provider:read"] },
  { method: "POST", path: "/executions", domain: "executions", summary: "Create execution", auth: true, permissions: ["execution:create"], body: { prompt: "string", organizationId: "string", workspaceId: "string?", capabilityId: "string?", budgetLimit: "number?", tokenBudgetLimit: "number?", stream: "boolean?", metadata: "object?" } },
  { method: "GET", path: "/executions", domain: "executions", summary: "Execution history", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}", domain: "executions", summary: "Get execution", auth: true, permissions: ["execution:read"] },
  { method: "POST", path: "/executions/{executionId}/cancel", domain: "executions", summary: "Cancel execution", auth: true, permissions: ["execution:cancel"] },
  { method: "POST", path: "/executions/{executionId}/retry", domain: "executions", summary: "Retry execution", auth: true, permissions: ["execution:retry"] },
  { method: "GET", path: "/executions/{executionId}/stream", domain: "executions", summary: "Stream execution (SSE frames in JSON envelope)", auth: true, permissions: ["execution:stream"] },
  { method: "GET", path: "/executions/{executionId}/artifacts", domain: "executions", summary: "Execution artifacts", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/diagnostics", domain: "executions", summary: "Execution diagnostics", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/trace", domain: "executions", summary: "Execution trace", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/cost", domain: "executions", summary: "Execution cost", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/cost-breakdown", domain: "executions", summary: "Execution cost breakdown", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/evaluation", domain: "executions", summary: "Execution evaluation", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/experience", domain: "executions", summary: "Execution experience", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/model-decision", domain: "executions", summary: "Model decision explainability", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/routing", domain: "executions", summary: "Routing explainability", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/planning", domain: "executions", summary: "Planning explainability", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/timeline", domain: "executions", summary: "Execution timeline", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/provider", domain: "executions", summary: "Provider selection", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/metrics", domain: "executions", summary: "Execution metrics", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/tokens", domain: "executions", summary: "Token usage", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/quality", domain: "executions", summary: "Quality scores", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/confidence", domain: "executions", summary: "Confidence bands", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/audit", domain: "executions", summary: "Immutable execution audit", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/executions/{executionId}/decision-graph", domain: "executions", summary: "Decision graph summary", auth: true, permissions: ["execution:read"] },
  { method: "GET", path: "/benchmarks", domain: "benchmarks", summary: "Benchmarks", auth: true, permissions: ["benchmark:read"] },
  { method: "GET", path: "/analytics/summary", domain: "analytics", summary: "Analytics summary", auth: true, permissions: ["analytics:read"] },
  { method: "GET", path: "/billing/summary", domain: "billing", summary: "Billing summary", auth: true, permissions: ["billing:read"] },
  { method: "GET", path: "/notifications", domain: "notifications", summary: "List notifications", auth: true, permissions: ["notification:read"] },
  { method: "GET", path: "/audit", domain: "audit", summary: "Audit logs", auth: true, permissions: ["audit:read"] },
  { method: "POST", path: "/files", domain: "files", summary: "Upload file metadata", auth: true, permissions: ["file:upload"], body: { name: "string", mimeType: "string", sizeBytes: "number" } },
  { method: "GET", path: "/files/{fileId}", domain: "files", summary: "Get file", auth: true, permissions: ["file:read"] },
  { method: "GET", path: "/reviews", domain: "human_reviews", summary: "Human reviews", auth: true, permissions: ["review:read"] },
  { method: "POST", path: "/webhooks", domain: "webhooks", summary: "Register webhook", auth: true, permissions: ["org:write"], body: { url: "string", events: ["string"] } },
  { method: "GET", path: "/brand-profiles", domain: "brand_profiles", summary: "Brand profiles (thin list)", auth: true, permissions: ["org:read"] },
  { method: "GET", path: "/knowledge-bases", domain: "knowledge_bases", summary: "Knowledge bases (thin list)", auth: true, permissions: ["workspace:read"] },
];

const legacyRoutes = [
  ["GET", "/auth/verify", "Auth", "Verify session"],
  ["POST", "/auth/register", "Auth", "Register"],
  ["POST", "/auth/register-login", "Auth", "Register or login"],
  ["POST", "/auth/logout", "Auth", "Logout"],
  ["POST", "/auth/register-fcm", "Auth", "Register FCM token"],
  ["POST", "/auth/forget-password", "Auth", "Forgot password"],
  ["POST", "/auth/send-email-verification", "Auth", "Send email verification"],
  ["GET", "/auth/verify-email", "Auth", "Verify email"],
  ["GET", "/dashboard/customer-project-count", "Dashboard", "Customer project count"],
  ["POST", "/categories/", "Categories", "Create category"],
  ["GET", "/categories/", "Categories", "List categories"],
  ["DELETE", "/categories/:categoryId", "Categories", "Delete category"],
  ["PUT", "/categories/:categoryId", "Categories", "Update category"],
  ["POST", "/users/create-user", "Users", "Create user"],
  ["POST", "/users/update-user", "Users", "Update user"],
  ["POST", "/users/update-internal-user", "Users", "Update internal user"],
  ["GET", "/users/fetch-customers", "Users", "Fetch customers"],
  ["GET", "/users/fetch-customer/:customer", "Users", "Fetch customer"],
  ["GET", "/users/fetch-customer-plan/:customer", "Users", "Fetch customer plan"],
  ["GET", "/users/fetch-resource", "Users", "Fetch resources"],
  ["GET", "/users/fetch-internal-team", "Users", "Fetch internal team"],
  ["POST", "/users/search", "Users", "Search users"],
  ["GET", "/users/disable-user/:firebaseID", "Users", "Disable user"],
  ["GET", "/users/enable-user/:firebaseID", "Users", "Enable user"],
  ["GET", "/users/:id", "Users", "Get user"],
  ["POST", "/users/update-tour-completion", "Users", "Update tour completion"],
  ["POST", "/organizations/", "Organizations", "Create organization"],
  ["POST", "/organizations/update/:organizationId", "Organizations", "Update organization"],
  ["GET", "/organizations/user-organization", "Organizations", "Current user organization"],
  ["GET", "/organizations/:userId", "Organizations", "Organization by user"],
  ["POST", "/teams/invite-member", "Teams", "Invite member"],
  ["PATCH", "/teams/invite-action", "Teams", "Accept/reject invite"],
  ["GET", "/teams/my-invitation", "Teams", "My invitations"],
  ["POST", "/teams/remove-member", "Teams", "Remove member"],
  ["GET", "/teams/fetch-team", "Teams", "Fetch team"],
  ["GET", "/teams/client-team/:organizationId", "Teams", "Client team"],
  ["POST", "/requirement/create", "Requirements", "Create requirement"],
  ["GET", "/requirement/", "Requirements", "List requirements"],
  ["GET", "/requirement/get/:id", "Requirements", "Get requirement"],
  ["GET", "/requirement/:userId", "Requirements", "Requirements by user"],
  ["POST", "/requirement/:reqId/:userId/:status", "Requirements", "Update requirement status"],
  ["POST", "/staff/", "Staff", "Create staff"],
  ["GET", "/staff/", "Staff", "List staff"],
  ["GET", "/staff/:id", "Staff", "Get staff"],
  ["POST", "/staff/update/:id", "Staff", "Update staff"],
  ["DELETE", "/staff/delete/:id", "Staff", "Delete staff"],
  ["POST", "/staff/assign-manager", "Staff", "Assign manager"],
  ["GET", "/chat/token", "Chat", "GetStream token"],
  ["POST", "/chat/create-channel", "Chat", "Create channel"],
  ["GET", "/chat/myRMChat", "Chat", "My RM chat"],
  ["POST", "/chat/add-member-in-chat-room", "Chat", "Add chat member"],
  ["POST", "/chat/remove-member-from-chat-room", "Chat", "Remove chat member"],
  ["POST", "/chat/send-automate-message", "Chat", "Send automated message"],
  ["GET", "/projects/", "Projects", "List projects"],
  ["POST", "/projects/", "Projects", "Create project"],
  ["GET", "/projects/assigned-projects", "Projects", "Assigned projects"],
  ["GET", "/projects/client/:userId", "Projects", "Client projects"],
  ["GET", "/projects/:projectId", "Projects", "Get project"],
  ["POST", "/projects/update/:projectId", "Projects", "Update project"],
  ["GET", "/projects/logs/:projectId", "Projects", "Project logs"],
  ["GET", "/projects/update-log/:customerId/:projectId/:stage", "Projects", "Update project log stage"],
  ["GET", "/packages/", "Packages", "List packages"],
  ["POST", "/packages/", "Packages", "Create package"],
  ["GET", "/packages/:id", "Packages", "Get package"],
  ["POST", "/packages/update/:id", "Packages", "Update package"],
  ["POST", "/packages/delete/:id", "Packages", "Delete package"],
  ["POST", "/tasks/", "Tasks", "Create task"],
  ["GET", "/tasks/", "Tasks", "List tasks"],
  ["GET", "/tasks/kanban", "Tasks", "Kanban tasks"],
  ["GET", "/tasks/:userId", "Tasks", "Tasks by user"],
  ["PUT", "/tasks/update/:taskId", "Tasks", "Update task"],
  ["GET", "/tasks/task-by-id/:id", "Tasks", "Get task"],
  ["POST", "/subscription/create-checkout-session", "Subscription", "Create checkout session"],
  ["GET", "/subscription/subscription-status", "Subscription", "Subscription status"],
  ["GET", "/subscription/fetch-checkout-session", "Subscription", "Fetch checkout session"],
  ["POST", "/subscription/create-user-subscription", "Subscription", "Create user subscription"],
  ["GET", "/subscription/payment-methods", "Subscription", "List payment methods"],
  ["POST", "/subscription/create-payment-method", "Subscription", "Create payment method"],
  ["POST", "/subscription/make-default-payment-method", "Subscription", "Default payment method"],
  ["POST", "/subscription/remove-payment-method", "Subscription", "Remove payment method"],
  ["GET", "/subscription/invoice-history", "Subscription", "Invoice history"],
  ["GET", "/plans/", "Plans", "List plans"],
  ["GET", "/plans/check-limit", "Plans", "Check plan limit"],
  ["GET", "/plans/check-limit/:userId", "Plans", "Check plan limit by user"],
  ["PUT", "/plans/:id", "Plans", "Update plan"],
  ["GET", "/notification/", "Notifications", "List notifications"],
  ["POST", "/notification/send", "Notifications", "Send notification"],
  ["POST", "/notification/send/email", "Notifications", "Send email notification"],
  ["POST", "/razorpay/subscriptions/create", "Razorpay", "Create subscription"],
  ["POST", "/razorpay/subscriptions/update", "Razorpay", "Update subscription"],
  ["POST", "/razorpay/subscriptions/cancel-update", "Razorpay", "Cancel subscription update"],
  ["POST", "/razorpay/subscriptions/cancel", "Razorpay", "Cancel subscription"],
  ["GET", "/razorpay/subscriptions", "Razorpay", "List subscriptions"],
  ["GET", "/razorpay/subscriptions/current", "Razorpay", "Current subscription"],
  ["GET", "/razorpay/subscriptions/customer/:userId", "Razorpay", "Customer subscriptions"],
  ["POST", "/razorpay/paymentVerification", "Razorpay", "Payment verification"],
  ["POST", "/razorpay/paymentVerificationapp", "Razorpay", "App payment verification"],
  ["GET", "/razorpay/payment/history", "Razorpay", "Payment history"],
  ["GET", "/razorpay/payment/history/:userId", "Razorpay", "Payment history by user"],
  ["GET", "/razorpay/invoice/:paymentId", "Razorpay", "Invoice"],
  ["GET", "/razorpay/plans", "Razorpay", "List Razorpay plans"],
  ["POST", "/razorpay/plans", "Razorpay", "Create Razorpay plan"],
  ["PUT", "/razorpay/plans/:plan_id", "Razorpay", "Update Razorpay plan"],
  ["DELETE", "/razorpay/plans/:plan_id", "Razorpay", "Delete Razorpay plan"],
  ["POST", "/razorpay/webhook", "Razorpay", "Razorpay webhook"],
  ["POST", "/razorpay/webhook", "Razorpay", "Mounted webhook alias"],
  ["GET", "/", "System", "Hello"],
];

function buildOpenApi() {
  const paths = {};
  for (const r of gatewayPaths) {
    const p = r.path;
    paths[p] = paths[p] || {};
    const op = {
      tags: [r.domain],
      summary: r.summary,
      operationId: `${r.method.toLowerCase()}${p.replace(/[{}/]/g, "_")}`,
      security: r.auth ? [{ bearerAuth: [] }, { apiKeyAuth: [] }] : [],
      parameters: [],
      responses: {
        "200": {
          description: "Success",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiSuccess" },
            },
          },
        },
        "201": {
          description: "Created",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiSuccess" },
            },
          },
        },
        "400": { $ref: "#/components/responses/BadRequest" },
        "401": { $ref: "#/components/responses/Unauthorized" },
        "403": { $ref: "#/components/responses/Forbidden" },
        "404": { $ref: "#/components/responses/NotFound" },
        "429": { $ref: "#/components/responses/RateLimited" },
        "500": { $ref: "#/components/responses/ServerError" },
      },
    };
    if (r.permissions.length) {
      op["x-permissions"] = r.permissions;
    }
    for (const m of p.matchAll(/\{(\w+)\}/g)) {
      op.parameters.push({
        name: m[1],
        in: "path",
        required: true,
        schema: { type: "string" },
      });
    }
    if (r.path === "/workspaces" && r.method === "GET") {
      op.parameters.push({
        name: "organizationId",
        in: "query",
        required: false,
        schema: { type: "string" },
      });
    }
    if (r.body) {
      const props = {};
      const required = [];
      for (const [k, v] of Object.entries(r.body)) {
        const optional = String(v).endsWith("?");
        const t = String(v).replace(/\?$/, "");
        if (Array.isArray(v)) {
          props[k] = { type: "array", items: { type: "string" } };
        } else if (t === "number") props[k] = { type: "number" };
        else if (t === "boolean") props[k] = { type: "boolean" };
        else if (t === "object") props[k] = { type: "object", additionalProperties: true };
        else if (t.includes("|")) props[k] = { type: "string", enum: t.split("|") };
        else props[k] = { type: "string" };
        if (!optional && !Array.isArray(v)) {
          // mark core required for known keys
          if (["email", "password", "organizationId", "deviceId", "name", "prompt"].includes(k)) {
            required.push(k);
          }
        }
      }
      op.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: props,
              ...(required.length ? { required } : {}),
            },
          },
        },
      };
    }
    paths[p][r.method.toLowerCase()] = op;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "UNAGENCY Enterprise API Gateway",
      version: "1.0.0",
      description:
        "Sole external Intelligence / platform entry point. Paths are identical under /v1 and /v2. Source of truth: src/platform/api/routes/route-map.ts. This inventory does not redesign APIs.",
      contact: { name: "UNAGENCY Platform" },
    },
    servers: [
      { url: "/v1", description: "API v1" },
      { url: "/v2", description: "API v2 (mirror)" },
    ],
    tags: [...new Set(gatewayPaths.map((r) => r.domain))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        apiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
      },
      schemas: {
        ApiSuccess: {
          type: "object",
          properties: {
            data: {},
            meta: { type: "object", additionalProperties: true },
          },
          required: ["data"],
        },
        ApiError: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: { type: "object", additionalProperties: true },
              },
              required: ["code", "message"],
            },
          },
          required: ["error"],
        },
        IssuedToken: {
          type: "object",
          properties: {
            accessToken: { type: "string" },
            refreshToken: { type: "string" },
            tokenType: { type: "string", enum: ["Bearer"] },
            expiresInSec: { type: "number" },
            scheme: { type: "string" },
            sessionId: { type: "string" },
          },
        },
        ExecutionResource: {
          type: "object",
          properties: {
            executionId: { type: "string" },
            status: { type: "string" },
            organizationId: { type: "string" },
            workspaceId: { type: "string" },
            capabilityId: { type: "string" },
            correlationId: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            promptPreview: { type: "string" },
            cost: { type: "number" },
            evaluationScore: { type: "number" },
          },
        },
      },
      responses: {
        BadRequest: {
          description: "Validation failed",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
        },
        Unauthorized: {
          description: "Authentication required",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
        },
        Forbidden: {
          description: "RBAC / tenant isolation denied",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
        },
        NotFound: {
          description: "Resource not found",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
        },
        RateLimited: {
          description: "Rate limit exceeded",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
        },
        ServerError: {
          description: "Internal error",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
        },
      },
    },
    "x-unagency": {
      surfaces: {
        enterpriseGateway: "src/platform/api — in-process; nginx expects /v1|/v2",
        legacyExpress: "src/app.ts — live SaaS HTTP today",
      },
      streaming: {
        note: "GET /executions/{id}/stream returns SSE-shaped frames inside JSON success envelope; not a native text/event-stream socket in V1 inventory.",
        transportsDocumented: ["sse", "websocket", "chunked"],
        providerSpecificStreaming: false,
      },
    },
  };
}

function yamlEscape(s) {
  if (s == null) return "";
  const str = String(s);
  if (/[:#{}[\],&*?|<>=!%@`]/.test(str) || str.includes("\n") || str.includes('"')) {
    return JSON.stringify(str);
  }
  return str;
}

function toYaml(obj, indent = 0) {
  const pad = "  ".repeat(indent);
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "string") return yamlEscape(obj);
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) {
    if (!obj.length) return "[]";
    return obj
      .map((item) => {
        if (item !== null && typeof item === "object") {
          const nested = toYaml(item, indent + 1);
          const lines = nested.split("\n");
          return `${pad}- ${lines[0]}\n${lines
            .slice(1)
            .map((l) => (l ? `${pad}  ${l.trimStart() === l ? l : l}` : l))
            .join("\n")}`
            .replace(/\n$/, "");
        }
        return `${pad}- ${toYaml(item, 0)}`;
      })
      .join("\n");
  }
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      lines.push(`${pad}${k}:`);
      lines.push(toYaml(v, indent + 1));
    } else if (Array.isArray(v)) {
      if (!v.length) lines.push(`${pad}${k}: []`);
      else if (typeof v[0] !== "object") {
        lines.push(`${pad}${k}:`);
        for (const item of v) lines.push(`${pad}  - ${toYaml(item, 0)}`);
      } else {
        lines.push(`${pad}${k}:`);
        lines.push(toYaml(v, indent + 1));
      }
    } else {
      lines.push(`${pad}${k}: ${toYaml(v, 0)}`);
    }
  }
  return lines.join("\n");
}

function buildPostman() {
  const items = gatewayPaths.map((r) => {
    const pathParts = r.path.replace(/^\//, "").split("/").map((seg) => {
      if (seg.startsWith("{") && seg.endsWith("}")) {
        return { type: "variable", value: seg.slice(1, -1) };
      }
      return seg;
    });
    const urlPath = r.path.replace(/\{(\w+)\}/g, ":$1");
    return {
      name: `${r.method} ${r.path}`,
      request: {
        method: r.method,
        header: [
          { key: "Authorization", value: "Bearer {{accessToken}}", type: "text", disabled: !r.auth },
          { key: "Content-Type", value: "application/json", type: "text" },
          { key: "x-api-key", value: "{{apiKey}}", type: "text", disabled: true },
        ],
        url: {
          raw: `{{baseUrl}}/v1${urlPath}`,
          host: ["{{baseUrl}}"],
          path: ["v1", ...r.path.replace(/^\//, "").split("/").map((s) => s.replace(/[{}]/g, ""))],
        },
        ...(r.body
          ? {
              body: {
                mode: "raw",
                raw: JSON.stringify(
                  Object.fromEntries(
                    Object.entries(r.body).map(([k, v]) => {
                      if (Array.isArray(v)) return [k, v];
                      const t = String(v).replace(/\?$/, "");
                      if (t === "number") return [k, 0];
                      if (t === "boolean") return [k, false];
                      if (t === "object") return [k, {}];
                      if (t.includes("|")) return [k, t.split("|")[0]];
                      return [k, `<${k}>`];
                    })
                  ),
                  null,
                  2
                ),
              },
            }
          : {}),
        description: `${r.summary}\nDomain: ${r.domain}\nPermissions: ${r.permissions.join(", ") || "none"}`,
      },
    };
  });

  const legacyItems = legacyRoutes.map(([method, p, folder, summary]) => ({
    name: `${method} ${p}`,
    request: {
      method,
      header: [{ key: "Authorization", value: "Bearer {{legacyToken}}", type: "text" }],
      url: { raw: `{{legacyBaseUrl}}${p}`, host: ["{{legacyBaseUrl}}"], path: p.split("/").filter(Boolean) },
      description: `[Legacy Express] ${folder}: ${summary}`,
    },
  }));

  return {
    info: {
      name: "UNAGENCY Complete API Inventory",
      description:
        "Enterprise Gateway (/v1|/v2) + Legacy Express SaaS surface. Generated inventory — no new endpoints invented.",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: [
      { key: "baseUrl", value: "http://localhost:3000" },
      { key: "legacyBaseUrl", value: "http://localhost:3000" },
      { key: "accessToken", value: "" },
      { key: "apiKey", value: "" },
      { key: "legacyToken", value: "" },
    ],
    item: [
      { name: "Enterprise Gateway v1", item: items },
      { name: "Legacy Express SaaS", item: legacyItems },
    ],
  };
}

function buildInsomnia() {
  const resources = [
    {
      _id: "wrk_unagency",
      _type: "workspace",
      name: "UNAGENCY API Inventory",
      description: "Generated from platform inventory",
    },
    {
      _id: "env_base",
      _type: "environment",
      parentId: "wrk_unagency",
      name: "Base",
      data: {
        base_url: "http://localhost:3000",
        access_token: "",
      },
    },
  ];
  let i = 0;
  for (const r of gatewayPaths) {
    i += 1;
    resources.push({
      _id: `req_${i}`,
      _type: "request",
      parentId: "wrk_unagency",
      name: `${r.method} /v1${r.path}`,
      method: r.method,
      url: `{{ _.base_url }}/v1${r.path.replace(/\{(\w+)\}/g, ":$1")}`,
      headers: [
        { name: "Authorization", value: "Bearer {{ _.access_token }}" },
        { name: "Content-Type", value: "application/json" },
      ],
      body: r.body
        ? {
            mimeType: "application/json",
            text: JSON.stringify(
              Object.fromEntries(Object.keys(r.body).map((k) => [k, ""])),
              null,
              2
            ),
          }
        : {},
    });
  }
  return {
    _type: "export",
    __export_format: 4,
    __export_date: new Date().toISOString(),
    __export_source: "unagency.api.inventory",
    resources,
  };
}

const openapi = buildOpenApi();
fs.writeFileSync(path.join(outDir, "OPENAPI.yaml"), `# UNAGENCY Enterprise API — OpenAPI 3.1\n# Source: src/platform/api/routes/route-map.ts\n# Do not invent endpoints — inventory only.\n\n` + toYaml(openapi) + "\n");
fs.writeFileSync(path.join(outDir, "OPENAPI.json"), JSON.stringify(openapi, null, 2));
fs.writeFileSync(path.join(outDir, "POSTMAN_COLLECTION.json"), JSON.stringify(buildPostman(), null, 2));
fs.writeFileSync(path.join(outDir, "INSOMNIA_COLLECTION.json"), JSON.stringify(buildInsomnia(), null, 2));
fs.writeFileSync(
  path.join(outDir, "_inventory.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      enterpriseGatewayRoutesPerVersion: gatewayPaths.length,
      enterpriseGatewayTotalWithVersions: gatewayPaths.length * 2,
      legacyExpressRoutes: legacyRoutes.length,
    },
    null,
    2
  )
);
console.log("Generated OPENAPI.yaml, OPENAPI.json, POSTMAN_COLLECTION.json, INSOMNIA_COLLECTION.json");
