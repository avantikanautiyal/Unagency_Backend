/**
 * Enterprise API Gateway interfaces.
 */

import type { Result } from "../../intelligence/shared/result";
import type {
  ApiRequest,
  ApiResponse,
  RouteDefinition,
  AuthCredential,
  AuthPrincipal,
  IssuedToken,
  CreateExecutionRequest,
  ExecutionResource,
  StreamEvent,
  StreamSubscription,
  StreamTransport,
  RateLimitDecision,
  TenantContext,
  OrganizationRecord,
  WorkspaceRecord,
  UserRecord,
  CapabilityResource,
  ProviderCatalogResource,
  ExecutionDiagnostics,
  ExecutionTraceSummary,
  ExecutionCostSummary,
  ExecutionEvaluationSummary,
  ExecutionExperienceSummary,
  ExecutionArtifactRef,
  SseFrame,
} from "../contracts";

export interface IApiGateway {
  handle(request: ApiRequest): Promise<Result<ApiResponse>>;
  listRoutes(version?: string): Result<readonly RouteDefinition[]>;
}

export interface IAuthenticationService {
  authenticate(credential: AuthCredential): Promise<Result<AuthPrincipal>>;
  login(input: {
    email: string;
    password: string;
    organizationId: string;
    deviceId: string;
    scheme?: AuthCredential["scheme"];
  }): Promise<Result<IssuedToken>>;
  issueApiKey(input: {
    organizationId: string;
    name: string;
    roles: AuthPrincipal["roles"];
  }): Promise<Result<{ apiKey: string; record: import("../contracts").ApiKeyRecord }>>;
  revokeSession(sessionId: string): Result<void>;
}

export interface IAuthorizationService {
  authorize(
    principal: AuthPrincipal,
    permissions: readonly import("../contracts").Permission[]
  ): Result<void>;
  permissionsFor(principal: AuthPrincipal): readonly import("../contracts").Permission[];
}

export interface ITenantService {
  ensureTenant(context: TenantContext): Result<TenantContext>;
  createOrganization(name: string): Result<OrganizationRecord>;
  createWorkspace(organizationId: string, name: string): Result<WorkspaceRecord>;
  createUser(input: {
    email: string;
    displayName: string;
    organizationId: string;
    roles: AuthPrincipal["roles"];
  }): Result<UserRecord>;
  getOrganization(organizationId: string): Result<OrganizationRecord | undefined>;
  listWorkspaces(organizationId: string): Result<readonly WorkspaceRecord[]>;
}

export interface IExecutionApiService {
  create(req: CreateExecutionRequest, principal: AuthPrincipal): Promise<Result<ExecutionResource>>;
  get(executionId: string, tenant: TenantContext): Result<ExecutionResource>;
  cancel(executionId: string, tenant: TenantContext): Promise<Result<ExecutionResource>>;
  retry(executionId: string, tenant: TenantContext): Promise<Result<ExecutionResource>>;
  history(tenant: TenantContext, limit?: number): Result<readonly ExecutionResource[]>;
  artifacts(executionId: string, tenant: TenantContext): Result<readonly ExecutionArtifactRef[]>;
  diagnostics(executionId: string, tenant: TenantContext): Result<ExecutionDiagnostics>;
  trace(executionId: string, tenant: TenantContext): Result<ExecutionTraceSummary>;
  cost(executionId: string, tenant: TenantContext): Result<ExecutionCostSummary>;
  evaluation(executionId: string, tenant: TenantContext): Result<ExecutionEvaluationSummary>;
  experience(executionId: string, tenant: TenantContext): Result<ExecutionExperienceSummary>;
}

export interface IStreamingService {
  subscribe(executionId: string, transport: StreamTransport): Result<StreamSubscription>;
  push(event: Omit<StreamEvent, "eventId" | "sequence" | "at"> & { sequence?: number }): Result<StreamEvent>;
  poll(subscriptionId: string, afterSequence?: number): Result<readonly StreamEvent[]>;
  toSse(events: readonly StreamEvent[]): Result<readonly SseFrame[]>;
}

export interface IRateLimitService {
  check(input: {
    organizationId?: string;
    workspaceId?: string;
    userId?: string;
    apiKeyId?: string;
    capabilityId?: string;
    providerId?: string;
  }): Result<RateLimitDecision>;
}

export interface ICatalogApiService {
  listCapabilities(): Result<readonly CapabilityResource[]>;
  listProviders(): Result<readonly ProviderCatalogResource[]>;
}
