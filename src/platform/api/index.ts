/**
 * Enterprise API Gateway & Platform Services.
 *
 * Sole external entry point for frontends and SDKs.
 * Consumes Integration Layer / Distributed Execution / Catalog via services.
 * Does not redesign Intelligence OS or Infrastructure.
 */

export * from "./contracts";
export * from "./interfaces";
export { ApiGatewayEngine } from "./gateway/api-gateway-engine";
export { API_ROUTE_MAP, matchRoute } from "./routes/route-map";
export { InMemoryAuthenticationService } from "./authentication/in-memory-authentication-service";
export { RbacAuthorizationService } from "./authorization/rbac-authorization-service";
export { permissionsForRoles, hasPermission } from "./authorization/rbac";
export { InMemoryTenantService } from "./tenants/in-memory-tenant-service";
export { InMemoryRateLimitService } from "./rate-limits/in-memory-rate-limit-service";
export { InMemoryStreamingService } from "./streaming/in-memory-streaming-service";
export { ExecutionApiService } from "./services/execution-api-service";
export { CatalogApiService } from "./services/catalog-api-service";
export { validateApiRequest, parseVersionFromPath } from "./validation/validate-request";
export { serializeSuccess, serializeError, defaultHeaders } from "./serialization/serialize";
export { MIDDLEWARE_PIPELINE } from "./middleware/pipeline";
export { SUPPORTED_API_VERSIONS, isSupportedVersion } from "./versioning/versions";
export {
  createEnterpriseApiPlatform,
  type EnterpriseApiPlatform,
  type CreateEnterpriseApiOptions,
} from "./factories/create-enterprise-api-platform";
export * from "./execution-intelligence";
