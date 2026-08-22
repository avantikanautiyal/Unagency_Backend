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
import { bootstrapIntelligenceGateway } from "../../intelligence/gateway/factories/bootstrap-gateway";
import { bootProductionExecution } from "../../production/execution/production-executor";
import {
  executionModeLabel,
  readEnterpriseApiRuntimeOptionsFromEnv,
  resolveEnterpriseApiExecutionMode,
  validateEnterpriseApiExecutionConfig,
  type EnterpriseApiExecutionMode,
} from "./execution-mode";
import { evaluateTextProviderEnv } from "../../production/execution/text-provider-env";
import { evaluateVideoProviderEnv } from "../../production/execution/video-provider-env";
import { evaluateAudioProviderEnv } from "../../production/execution/audio-provider-env";
import { evaluateImageProviderEnv } from "../../production/execution/image-provider-env";

export interface EnterpriseApiRuntime {
  readonly platform: EnterpriseApiPlatform;
  readonly executionMode: EnterpriseApiExecutionMode;
  readonly firebaseBridgeEnabled: boolean;
  readonly mountedAt: string;
  readonly configuredProviders?: readonly string[];
}

let runtimeInstance: EnterpriseApiRuntime | undefined;

/**
 * Wire kernel + gateway + orchestrator to the production integration engine.
 * Idempotent — safe to call from sync/async bootstrap and app startup.
 */
export async function wireIntelligenceControlPlane(
  platform: EnterpriseApiPlatform
): Promise<void> {
  if (platform.intelligencePlatform?.gateway) {
    platform.executions.setIntelligenceGateway(platform.intelligencePlatform.gateway);
    platform.intelligenceGatewayHolder?.set(platform.intelligencePlatform.gateway);
    return;
  }

  const integrationEngine = platform.integrationEngine;
  if (!integrationEngine) {
    throw new Error(
      "Cannot wire intelligence control plane — integration engine is not available on platform"
    );
  }

  const intelligencePlatform = await bootstrapIntelligenceGateway({
    autoStartKernel: true,
    registerMocks: false,
    integration: integrationEngine,
    capabilityRegistry: platform.executions.getCapabilityRegistry(),
  });

  platform.intelligencePlatform = intelligencePlatform;
  platform.executions.setIntelligenceGateway(intelligencePlatform.gateway);
  platform.intelligenceGatewayHolder?.set(intelligencePlatform.gateway);
  console.log(
    "🧠 [AI OS] Intelligence control plane wired — kernel → gateway → orchestrator → integration"
  );
}

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
    const { syncBilledProviderEnvFromDotenvFile } = await import(
      "../../production/execution/sync-billed-provider-env"
    );
    const cleared = syncBilledProviderEnvFromDotenvFile();
    if (cleared.length > 0) {
      console.log(
        `🧠 [AI OS] cleared leftover provider env (commented/absent in .env): ${cleared.join(", ")}`
      );
    }
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
      toolRuntime: boot.value.toolRuntime,
      runtimeDispatcher: boot.value.runtimeDispatcher,
      // Unify LIVE leaves so image/video routers see OpenAI GPT Image + TTS too.
      providerRuntimeRegistry: boot.value.providerRuntimeRegistry,
    };
    configuredProviders = boot.value.configuredProviders;
    console.log(
      `⚙️  [AI OS] LIVE providers ready: ${configuredProviders.join(", ") || "(none)"}`
    );
    console.log("⚙️  [AI OS] tool runtime: configured (structured output + tools)");
  }

  const platform = createEnterpriseApiPlatform(platformOptions);
  const liveIds =
    platform.providerRuntimeRegistry?.listAvailableProviderIds().map(String) ??
    configuredProviders;
  if (executionMode === "live") {
    configuredProviders = liveIds;
    logLiveProviderInventory(liveIds ?? []);
  }

  // Intelligence control plane — kernel → gateway → orchestrator → integration pipeline.
  await wireIntelligenceControlPlane(platform);

  runtimeInstance = buildRuntime(
    platform,
    executionMode,
    merged.enableFirebaseBridge === true,
    configuredProviders
  );
  return runtimeInstance;
}

function logLiveProviderInventory(executableIds: readonly string[]): void {
  const billed = new Set(executableIds);
  console.log(
    `🧠 [AI OS] LIVE executable leaves: ${executableIds.join(", ") || "(none)"}`
  );
  const skipped: string[] = [];
  for (const row of evaluateTextProviderEnv()) {
    if (!row.enabled) skipped.push(`${row.providerId} (text, no billed key)`);
  }
  for (const row of evaluateVideoProviderEnv()) {
    if (row.executable) continue;
    if (row.blockedReason) {
      skipped.push(`${row.providerId} (video, ${row.blockedReason})`);
    } else if (!row.configured || !row.enabled) {
      skipped.push(`${row.providerId} (video, no billed key)`);
    }
  }
  for (const row of evaluateAudioProviderEnv()) {
    if (row.executable) continue;
    if (row.blockedReason) skipped.push(`${row.providerId} (audio, ${row.blockedReason})`);
    else if (!row.enabled) skipped.push(`${row.providerId} (audio, no billed key)`);
  }
  for (const row of evaluateImageProviderEnv()) {
    if (row.executable) continue;
    if (row.blockedReason) skipped.push(`${row.providerId} (image, ${row.blockedReason})`);
    else if (!row.enabled) skipped.push(`${row.providerId} (image, no billed key)`);
  }
  const notable = skipped.filter(
    (s) =>
      !s.includes("cohere") &&
      !s.includes("together") &&
      !s.includes("fireworks") &&
      !s.includes("openrouter") &&
      !s.includes("alibaba") &&
      !s.includes("moonshot") &&
      !s.includes("perplexity") &&
      !s.includes("cartesia") &&
      !s.includes("playai") &&
      !s.includes("sesame") &&
      !s.includes("suno") &&
      !s.includes("udio") &&
      !s.includes("stability") &&
      !s.includes("hidream") &&
      !s.includes("reve") &&
      !s.includes("picsart") &&
      !s.includes("freepik") &&
      !s.includes("midjourney") &&
      !s.includes("ideogram") &&
      !s.includes("recraft") &&
      !s.includes("runway") &&
      !s.includes("luma") &&
      !s.includes("pika") &&
      !s.includes("minimax") &&
      !s.includes("pixverse") &&
      !s.includes("heygen") &&
      !s.includes("wan") &&
      !s.includes("higgsfield")
  );
  if (notable.length) {
    console.log(`🧠 [AI OS] not called (commented, missing, or unverified): ${notable.join("; ")}`);
  }
  if (!billed.has("provider.seedance") && process.env.SEEDANCE_API_KEY?.trim()) {
    console.log(
      "🧠 [AI OS] Seedance key present but not executable — check SEEDANCE_ENABLED and WaveSpeed connectivity"
    );
  }
  if (billed.has("provider.seedance")) {
    console.log("🧠 [AI OS] Seedance video provider LIVE via WaveSpeed");
  }
  if (!process.env.KLING_SECRET_KEY?.trim() && process.env.KLING_ACCESS_KEY?.trim()) {
    console.log(
      "🧠 [AI OS] Kling: using ACCESS_KEY as JWT secret (KLING_SECRET_KEY not set)"
    );
  }
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
