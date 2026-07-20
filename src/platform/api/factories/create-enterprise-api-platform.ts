/**
 * Enterprise API Gateway factory.
 * Wires auth, tenants, executions (Distributed Execution), catalog, streaming, rate limits.
 */

import { createDistributedExecutionPlatform } from "../../infrastructure/execution/factories/create-distributed-execution-platform";
import type { IDistributedExecutionEngine } from "../../infrastructure/execution/interfaces/execution";
import type { IIntelligenceOsIntegrationEngine } from "../../intelligence/integration/interfaces/integration";
import { InMemoryAuthenticationService } from "../authentication/in-memory-authentication-service";
import { RbacAuthorizationService } from "../authorization/rbac-authorization-service";
import { InMemoryTenantService } from "../tenants/in-memory-tenant-service";
import { InMemoryRateLimitService } from "../rate-limits/in-memory-rate-limit-service";
import { InMemoryStreamingService } from "../streaming/in-memory-streaming-service";
import { ExecutionApiService } from "../services/execution-api-service";
import { CatalogApiService } from "../services/catalog-api-service";
import { ApiGatewayEngine } from "../gateway/api-gateway-engine";
import { ExecutionIntelligenceApiService } from "../execution-intelligence";
import type { IApiGateway } from "../interfaces";

export interface EnterpriseApiPlatform {
  readonly gateway: IApiGateway;
  readonly auth: InMemoryAuthenticationService;
  readonly tenants: InMemoryTenantService;
  readonly executions: ExecutionApiService;
  readonly executionIntelligence: ExecutionIntelligenceApiService;
  readonly streaming: InMemoryStreamingService;
  readonly rateLimits: InMemoryRateLimitService;
  readonly catalog: CatalogApiService;
  readonly seed?: {
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly userId: string;
    readonly email: string;
  };
}

export interface CreateEnterpriseApiOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly distributed?: IDistributedExecutionEngine;
  readonly integration?: IIntelligenceOsIntegrationEngine;
  /** Wire Distributed Execution with Integration Layer (heavier). Default: stub executor. */
  readonly useIntegrationLayer?: boolean;
  /** Bootstrap demo org + admin user for local/testing. Default true. */
  readonly seedDemoTenant?: boolean;
}

export function createEnterpriseApiPlatform(
  options: CreateEnterpriseApiOptions = {}
): EnterpriseApiPlatform {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());
  let seq = 0;
  const createId =
    options.createId ?? ((p: string) => `${p}_${++seq}_${clockMs()}`);

  const auth = new InMemoryAuthenticationService(nowIso, createId, clockMs);
  const authorization = new RbacAuthorizationService();
  const tenants = new InMemoryTenantService(nowIso, createId);
  const streaming = new InMemoryStreamingService(nowIso, createId);
  const rateLimits = new InMemoryRateLimitService(nowIso, clockMs);
  const catalog = new CatalogApiService();
  const executionIntelligence = new ExecutionIntelligenceApiService();

  let distributed = options.distributed;
  if (!distributed && !options.integration) {
    distributed = createDistributedExecutionPlatform({
      nowIso,
      clockMs,
      createId,
      useIntegrationLayer: options.useIntegrationLayer ?? false,
    }).engine;
  }

  const executions = new ExecutionApiService({
    nowIso,
    createId,
    clockMs,
    distributed,
    integration: options.integration,
    streaming,
    autoTick: true,
    onIntelligenceSnapshot: (snap) => executionIntelligence.attachSnapshot(snap),
  });

  let seed: EnterpriseApiPlatform["seed"];
  if (options.seedDemoTenant !== false) {
    const org = tenants.createOrganization("UNAGENCY Demo");
    if (org.ok) {
      const ws = tenants.createWorkspace(org.value.organizationId, "Default");
      const user = tenants.createUser({
        email: "admin@unagency.local",
        displayName: "Platform Admin",
        organizationId: org.value.organizationId,
        roles: ["owner"],
      });
      if (user.ok && ws.ok) {
        auth.seedUser({
          email: "admin@unagency.local",
          password: "admin",
          userId: user.value.userId,
          organizationId: org.value.organizationId,
          roles: ["owner"],
        });
        seed = {
          organizationId: org.value.organizationId,
          workspaceId: ws.value.workspaceId,
          userId: user.value.userId,
          email: "admin@unagency.local",
        };
      }
    }
  }

  const gateway = new ApiGatewayEngine({
    auth,
    authorization,
    tenants,
    executions,
    executionIntelligence,
    streaming,
    rateLimits,
    catalog,
    nowIso,
    clockMs,
  });

  return {
    gateway,
    auth,
    tenants,
    executions,
    executionIntelligence,
    streaming,
    rateLimits,
    catalog,
    seed,
  };
}
