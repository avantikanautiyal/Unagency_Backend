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
  runEnterpriseAdaptiveRoutingStartupValidation,
  type AdaptiveRoutingStartupResult,
} from "./adaptive-routing-startup";

export type { AdaptiveRoutingStartupResult };
export { runEnterpriseAdaptiveRoutingStartupValidation };
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
import { bootAccountingPlatform } from "../../accounting/boot-accounting-platform";

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

  // Best-effort: register vision auditor in non-LIVE too when key present.
  void import("../../config/format-production-spec")
    .then(({ registerOpenAiVisualFieldGuideJudgeRunner }) => {
      registerOpenAiVisualFieldGuideJudgeRunner();
    })
    .catch(() => undefined);

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
        `🧠 [Direct] cleared leftover provider env (commented/absent in .env): ${cleared.join(", ")}`
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
      `⚙️  [Direct] LIVE providers ready: ${configuredProviders.join(", ") || "(none)"}`
    );
    console.log("⚙️  [Direct] tool runtime: configured (structured output + tools)");
  }

  await bootAccountingPlatform({ useMongo: true, seedPricing: true });
  console.log("💰 [Accounting] AI usage ledger bootstrapped");

  const platform = createEnterpriseApiPlatform(platformOptions);
  const liveIds =
    platform.providerRuntimeRegistry?.listAvailableProviderIds().map(String) ??
    configuredProviders;
  if (executionMode === "live") {
    configuredProviders = liveIds;
    logLiveProviderInventory(liveIds ?? []);
  }

  runtimeInstance = buildRuntime(
    platform,
    executionMode,
    merged.enableFirebaseBridge === true,
    configuredProviders
  );

  // Phase 6 — register Visual Field Guide vision auditor when OpenAI key is present.
  try {
    const { registerOpenAiVisualFieldGuideJudgeRunner } = await import(
      "../../config/format-production-spec"
    );
    const registered = registerOpenAiVisualFieldGuideJudgeRunner();
    if (registered) {
      console.log(
        "🎨 [Visual Field Guide] OpenAI vision auditor registered (VISUAL_FIELD_GUIDE_VISION rollout applies)"
      );
    } else {
      console.log(
        "🎨 [Visual Field Guide] Vision auditor skipped (no OPENAI_API_KEY) — measured evidence only"
      );
    }
  } catch (err) {
    console.warn(
      `🎨 [Visual Field Guide] Vision auditor registration failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  return runtimeInstance;
}

function logLiveProviderInventory(executableIds: readonly string[]): void {
  const billed = new Set(executableIds);
  console.log(
    `🧠 [Direct] LIVE executable leaves: ${executableIds.join(", ") || "(none)"}`
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
    console.log(`🧠 [Direct] not called (commented, missing, or unverified): ${notable.join("; ")}`);
  }
  if (!billed.has("provider.seedance") && process.env.SEEDANCE_API_KEY?.trim()) {
    console.log(
      "🧠 [Direct] Seedance key present but not executable — check SEEDANCE_ENABLED and WaveSpeed connectivity"
    );
  }
  if (billed.has("provider.seedance")) {
    console.log("🧠 [Direct] Seedance video provider LIVE via WaveSpeed");
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
