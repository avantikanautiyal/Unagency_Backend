/**
 * Enterprise API runtime bootstrap — single long-lived platform instance for HTTP transport.
 *
 * Lifecycle:
 *   startup → bootstrapEnterpriseApiRuntime[Async]() → mount Express adapter → handle requests
 *
 * LIVE mode requires async bootstrap (OpenAI provider boot is async).
 */

import {
  createEnterpriseApiPlatform,
  type CreateEnterpriseApiOptions,
  type EnterpriseApiPlatform,
} from "../factories/create-enterprise-api-platform";
import { bootProductionExecution } from "../../production/execution/production-executor";
import {
  executionModeLabel,
  parseEnterpriseApiExecutionModeFromEnv,
  readEnterpriseApiRuntimeOptionsFromEnv,
  resolveEnterpriseApiExecutionMode,
  validateEnterpriseApiExecutionConfig,
  type EnterpriseApiExecutionMode,
} from "./execution-mode";

export interface EnterpriseApiRuntime {
  readonly platform: EnterpriseApiPlatform;
  readonly executionMode: EnterpriseApiExecutionMode;
  readonly firebaseBridgeEnabled: boolean;
  readonly mountedAt: string;
  readonly configuredProviders?: readonly string[];
}

let runtimeInstance: EnterpriseApiRuntime | undefined;

function buildRuntime(
  platform: EnterpriseApiPlatform,
  executionMode: EnterpriseApiExecutionMode,
  firebaseBridgeEnabled: boolean,
  configuredProviders?: readonly string[]
): EnterpriseApiRuntime {
  return {
    platform,
    executionMode,
    firebaseBridgeEnabled,
    mountedAt: new Date().toISOString(),
    configuredProviders,
  };
}

export function bootstrapEnterpriseApiRuntime(
  options: CreateEnterpriseApiOptions = {}
): EnterpriseApiRuntime {
  if (runtimeInstance) {
    return runtimeInstance;
  }

  const merged: CreateEnterpriseApiOptions = {
    ...readEnterpriseApiRuntimeOptionsFromEnv(),
    ...options,
  };

  const executionMode = resolveEnterpriseApiExecutionMode(merged);
  validateEnterpriseApiExecutionConfig(executionMode);

  if (executionMode === "live") {
    throw new Error(
      "ENTERPRISE_API_EXECUTION_MODE=live requires bootstrapEnterpriseApiRuntimeAsync()"
    );
  }

  const platform = createEnterpriseApiPlatform({ ...merged, executionMode });
  runtimeInstance = buildRuntime(
    platform,
    executionMode,
    merged.enableFirebaseBridge === true
  );
  return runtimeInstance;
}

export async function bootstrapEnterpriseApiRuntimeAsync(
  options: CreateEnterpriseApiOptions = {}
): Promise<EnterpriseApiRuntime> {
  if (runtimeInstance) {
    return runtimeInstance;
  }

  const merged: CreateEnterpriseApiOptions = {
    ...readEnterpriseApiRuntimeOptionsFromEnv(),
    ...options,
  };

  const executionMode = resolveEnterpriseApiExecutionMode(merged);
  validateEnterpriseApiExecutionConfig(executionMode);

  let platformOptions: CreateEnterpriseApiOptions = { ...merged, executionMode };
  let configuredProviders: readonly string[] | undefined;

  if (executionMode === "live") {
    const boot = await bootProductionExecution({
      nowIso: merged.nowIso,
      clockMs: merged.clockMs,
      createId: merged.createId,
      mode: "live",
    });
    if (!boot.ok) {
      throw new Error(
        `LIVE execution bootstrap failed: ${boot.error.message}`
      );
    }
    platformOptions = {
      ...platformOptions,
      integration: boot.value.integration,
    };
    configuredProviders = ["openai"];
  }

  const platform = createEnterpriseApiPlatform(platformOptions);
  runtimeInstance = buildRuntime(
    platform,
    executionMode,
    merged.enableFirebaseBridge === true,
    configuredProviders
  );
  return runtimeInstance;
}

export function getEnterpriseApiRuntime(): EnterpriseApiRuntime | undefined {
  return runtimeInstance;
}

export function resetEnterpriseApiRuntimeForTests(): void {
  runtimeInstance = undefined;
}

export function logEnterpriseApiMount(
  executionMode: EnterpriseApiExecutionMode,
  firebaseBridgeEnabled: boolean,
  configuredProviders?: readonly string[]
): void {
  console.log("⚙️  UNAGENCY Enterprise API mounted at /v1 and /v2");
  console.log(`⚙️  Enterprise API execution mode: ${executionModeLabel(executionMode)}`);
  if (executionMode === "live") {
    console.log("⚙️  Production provider routing: enabled");
    console.log(
      `⚙️  Configured providers: ${configuredProviders?.join(", ") ?? "openai"}`
    );
    console.log("⚙️  Default simulation: disabled for LIVE execution");
  } else if (executionMode === "simulated") {
    console.log("⚙️  Production provider routing: disabled (simulated dispatcher)");
  } else {
    console.log("⚙️  Production provider routing: disabled (stub executor)");
  }
  if (firebaseBridgeEnabled) {
    console.log(
      "⚙️  Enterprise API auth: Firebase ID tokens + platform credentials (jwt_*, api_key_*)"
    );
  } else {
    console.log("⚙️  Enterprise API auth: platform credentials only");
  }
}
