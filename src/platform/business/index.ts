/**
 * UNAGENCY Business Platform — SaaS product layer above Intelligence OS.
 *
 * Does not execute AI. Delegates exclusively through Enterprise API Gateway.
 */

export * from "./contracts";
export * from "./interfaces";
export { BusinessPlatformEngine } from "./engine/business-platform-engine";
export { GatewayExecutionClient } from "./integrations/gateway-execution-client";
export { permissionsForRoles, hasBusinessPermission } from "./organizations/permissions";
export {
  BusinessOrganizationBuilder,
  BusinessExecutionRequestBuilder,
} from "./builders/business-builders";
export {
  createBusinessPlatform,
  type BusinessPlatform,
  type CreateBusinessPlatformOptions,
} from "./factories/create-business-platform";
export * from "./brand-brain";
export * from "./knowledge-intelligence";
