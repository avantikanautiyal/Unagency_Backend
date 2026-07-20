/**
 * Universal Provider Generator & Integration Factory.
 *
 * The ONLY supported mechanism for integrating new AI providers into UNAGENCY.
 * OpenAI remains the reference implementation; generators emit isomorphic leaves.
 */

export * from "./contracts";
export * from "./interfaces";
export * from "./constants";
export { ProviderGenerationRequestBuilder } from "./builders/generation-request-builder";
export { buildTemplateContext, toPascalCase, toConstantCase } from "./builders/naming";
export {
  createProviderGeneratorPlatform,
  type ProviderGeneratorPlatform,
  type CreateProviderGeneratorOptions,
} from "./factories/create-provider-generator-platform";
export { ProviderGeneratorEngine } from "./engine/provider-generator-engine";
export { defaultApiKeyAuth } from "./authentication/auth-schema";
