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
import type {
  ExecutionHistoryPage,
  ExecutionHistoryQuery,
} from "../../infrastructure/durability/interfaces/execution-store-ports";

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

export interface ExternalOrganizationSyncInput {
  readonly organizationId: string;
  readonly name: string;
}

export interface ITenantService {
  ensureTenant(context: TenantContext): Promise<Result<TenantContext>>;
  syncOrganizationFromExternal?(
    input: ExternalOrganizationSyncInput
  ): Promise<Result<OrganizationRecord>>;
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
  /** M10.8 — create + live SSE via StreamingExecutionOrchestrator (simulated FakeStreamingDispatcher). */
  createStream(
    req: CreateExecutionRequest,
    principal: AuthPrincipal,
    tenant: TenantContext,
    abortSignal?: AbortSignal
  ): Promise<Result<import("../services/execution-streaming-service").LiveSseExecutionPayload>>;
  get(executionId: string, tenant: TenantContext): Promise<Result<ExecutionResource>>;
  cancel(executionId: string, tenant: TenantContext): Promise<Result<ExecutionResource>>;
  retry(executionId: string, tenant: TenantContext): Promise<Result<ExecutionResource>>;
  duplicate(executionId: string, tenant: TenantContext): Promise<Result<ExecutionResource>>;
  softDelete(executionId: string, tenant: TenantContext): Promise<Result<ExecutionResource>>;
  setPinned(
    executionId: string,
    tenant: TenantContext,
    pinned: boolean
  ): Promise<Result<ExecutionResource>>;
  setFavorite(
    executionId: string,
    tenant: TenantContext,
    favorite: boolean
  ): Promise<Result<ExecutionResource>>;
  decideToolApproval(
    executionId: string,
    invocationKey: string,
    decision: "approve" | "reject",
    principal: AuthPrincipal,
    tenant: TenantContext
  ): Promise<Result<ExecutionResource>>;
  history(
    tenant: TenantContext,
    query?: ExecutionHistoryQuery
  ): Promise<Result<ExecutionHistoryPage>>;
  artifacts(executionId: string, tenant: TenantContext): Promise<Result<readonly ExecutionArtifactRef[]>>;
  diagnostics(executionId: string, tenant: TenantContext): Promise<Result<ExecutionDiagnostics>>;
  trace(executionId: string, tenant: TenantContext): Promise<Result<ExecutionTraceSummary>>;
  cost(executionId: string, tenant: TenantContext): Promise<Result<ExecutionCostSummary>>;
  evaluation(executionId: string, tenant: TenantContext): Promise<Result<ExecutionEvaluationSummary>>;
  experience(executionId: string, tenant: TenantContext): Promise<Result<ExecutionExperienceSummary>>;
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
  }): Promise<Result<RateLimitDecision>>;
  /** True when shared Redis-backed limiter is available (durable mode). */
  isAvailable?(): boolean;
}

export interface ICatalogApiService {
  listCapabilities(): Result<readonly CapabilityResource[]>;
  listProviders(): Result<readonly ProviderCatalogResource[]>;
}
