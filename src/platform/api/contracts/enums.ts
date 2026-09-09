/**
 * Enterprise API enumerations.
 */

export type ApiVersion = "v1" | "v2";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type AuthScheme =
  | "jwt"
  | "oauth"
  | "api_key"
  | "service_account"
  | "session";

export type PrincipalKind = "user" | "service" | "api_key" | "anonymous";

export type Permission =
  | "org:read"
  | "org:write"
  | "workspace:read"
  | "workspace:write"
  | "execution:create"
  | "execution:read"
  | "execution:cancel"
  | "execution:retry"
  | "execution:stream"
  | "capability:read"
  | "provider:read"
  | "benchmark:read"
  | "analytics:read"
  | "billing:read"
  | "billing:write"
  | "notification:read"
  | "audit:read"
  | "file:upload"
  | "file:read"
  | "review:read"
  | "review:write"
  | "search:read"
  | "admin:*";

export type RoleName =
  | "owner"
  | "admin"
  | "member"
  | "viewer"
  | "billing"
  | "service";

export type ExecutionApiStatus =
  | "queued"
  | "running"
  | "waiting_provider"
  | "awaiting_approval"
  | "processing_result"
  | "streaming"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "retrying";

export type StreamTransport = "sse" | "websocket" | "chunked";

export type StreamEventKind =
  | "progress"
  | "status"
  | "chunk"
  | "artifact"
  | "error"
  | "done";

export type RateLimitDimension =
  | "organization"
  | "workspace"
  | "user"
  | "api_key"
  | "capability"
  | "provider";

export type ApiDomain =
  | "authentication"
  | "organizations"
  | "users"
  | "workspaces"
  | "projects"
  | "brand_profiles"
  | "knowledge_bases"
  | "capabilities"
  | "executions"
  | "providers"
  | "models"
  | "benchmarks"
  | "analytics"
  | "billing"
  | "notifications"
  | "audit"
  | "files"
  | "assets"
  | "human_reviews"
  | "webhooks"
  | "search"
  | "health"
  | "refinement"
  | "delivery"
  | "os_artifacts"
  | "cdf";
