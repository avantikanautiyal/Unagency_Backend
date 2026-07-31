/**
 * Tool runtime readiness (soft — zero tools does not fail global readiness).
 */

import type { IToolRegistry } from "../registry/in-memory-tool-registry";
import { loadToolExecutionConfig } from "../config/tool-execution-config";
import type { IToolInvocationStore } from "../idempotency/tool-invocation-store";

/** Providers with verified OpenAI-compatible tool loop mapping. */
export const FULL_TOOL_LOOP_PROVIDER_IDS = [
  "provider.openai",
  "provider.mistral",
  "provider.groq",
  "provider.deepseek",
  "provider.xai",
  "provider.together",
  "provider.fireworks",
  "provider.openrouter",
] as const;

/** Structured output: json_object / json_schema request mapping verified. */
export const STRUCTURED_OUTPUT_PROVIDER_IDS = [
  "provider.openai",
  "provider.mistral",
  "provider.groq",
  "provider.deepseek",
  "provider.xai",
  "provider.together",
  "provider.fireworks",
  "provider.openrouter",
] as const;

export function evaluateToolRuntimeReadiness(input?: {
  readonly registry?: IToolRegistry;
  readonly env?: NodeJS.ProcessEnv;
  readonly invocationStore?: IToolInvocationStore;
  readonly durable?: boolean;
}): {
  toolRuntimeEnabled: boolean;
  registeredTools: number;
  toolCapableProviders: number;
  structuredOutputProviders: number;
  toolInvocationStore: "durable" | "memory" | "unconfigured";
} {
  const config = loadToolExecutionConfig(input?.env ?? process.env);
  return {
    toolRuntimeEnabled: config.enabled,
    registeredTools: input?.registry?.size() ?? 0,
    toolCapableProviders: FULL_TOOL_LOOP_PROVIDER_IDS.length,
    structuredOutputProviders: STRUCTURED_OUTPUT_PROVIDER_IDS.length,
    toolInvocationStore: input?.invocationStore
      ? input.durable
        ? "durable"
        : "memory"
      : "unconfigured",
  };
}
