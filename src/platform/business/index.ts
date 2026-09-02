/**
 * UNAGENCY Business Platform — SaaS product layer above direct execution.
 *
 * Does not execute AI. Delegates exclusively through Enterprise API Gateway.
 */

export * from "./contracts";
export * from "./interfaces";
export { BusinessPlatformEngine } from "./engine/business-platform-engine";
export { GatewayExecutionClient } from "./integrations/gateway-execution-client";
export { permissionsForRoles, hasBusinessPermission } from "./organizations/permissions";
