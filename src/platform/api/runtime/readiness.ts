/**
 * Enterprise API readiness probes — dependency checks for accepting work.
 * Liveness (/health) remains process-alive only.
 */

import mongoose from "mongoose";
import type { EnterpriseApiExecutionMode } from "./execution-mode";
import {
  isDurableRuntimeEnabled,
  redisConnectionFromEnv,
} from "../../infrastructure/durability/durable-mode";
import { pingSharedRedis } from "../../infrastructure/durability/redis/redis-client-factory";
import { evaluateTextProviderEnv } from "../../production/execution/text-provider-env";
import { evaluateVideoReadiness } from "../../production/execution/register-video-providers";
import { evaluateAudioReadiness } from "../../production/execution/register-audio-providers";
import { evaluateEmbeddingReadiness } from "../../production/execution/embedding-provider-env";
import { evaluateToolRuntimeReadiness } from "../../providers/tools/readiness/tool-runtime-readiness";
import { evaluateStreamingReadiness } from "../../providers/streaming/capability/streaming-readiness";
import {
  isRunwayLiveCertificationReady,
  resolveVideoCertificationProviderId,
} from "../../production/execution/video-certification-config";
import { RUNWAY_VIDEO_SPEC } from "../../providers/video/configs/verified-video-provider-specs";
import { isAsyncMediaEnabled } from "../../infrastructure/durability/create-async-media-platform";
import type { AsyncMediaPlatform } from "../../infrastructure/durability/create-async-media-platform";
import { pingAsyncMediaDependencies } from "../../infrastructure/durability/create-async-media-platform";
import type { DurableStores } from "../../infrastructure/durability";

export interface ReadinessCheck {
  readonly name: string;
  readonly ready: boolean;
  readonly detail?: string;
}

export interface ReadinessReport {
  readonly status: "ready" | "not_ready";
  readonly executionMode: EnterpriseApiExecutionMode;
  readonly checks: readonly ReadinessCheck[];
  readonly generatedAt: string;
}

export async function evaluateReadiness(input: {
  executionMode: EnterpriseApiExecutionMode;
  nowIso?: () => string;
  env?: NodeJS.ProcessEnv;
  asyncMedia?: AsyncMediaPlatform;
  durableStores?: DurableStores;
}): Promise<ReadinessReport> {
  const env = input.env ?? process.env;
  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const checks: ReadinessCheck[] = [];

  if (input.executionMode === "live") {
    const providerStatuses = evaluateTextProviderEnv(env);
    const configuredCount = providerStatuses.filter((p) => p.configured).length;
    const executableCount = providerStatuses.filter((p) => p.enabled).length;

    checks.push({
      name: "executable_provider",
      ready: executableCount >= 1,
      detail: `${executableCount} executable / ${configuredCount} configured text providers`,
    });

    const videoReadiness = evaluateVideoReadiness(env);
    checks.push({
      name: "video_providers",
      ready: videoReadiness.videoProvidersExecutable >= 1,
      detail: `inventory=${videoReadiness.videoProvidersInventory} verified=${videoReadiness.videoProvidersVerified} configured=${videoReadiness.videoProvidersConfigured} executable=${videoReadiness.videoProvidersExecutable}`,
    });

    const audioReadiness = evaluateAudioReadiness(env);
    checks.push({
      name: "audio_providers",
      ready: audioReadiness.audioProvidersExecutable >= 0,
      detail: `inventory=${audioReadiness.audioProvidersInventory} verified=${audioReadiness.audioProvidersVerified} configured=${audioReadiness.audioProvidersConfigured} executable=${audioReadiness.audioProvidersExecutable} speech=${audioReadiness.speechProvidersExecutable}`,
    });

    const embeddingReadiness = evaluateEmbeddingReadiness(env);
    checks.push({
      name: "embedding_providers",
      ready: embeddingReadiness.embeddingProvidersExecutable >= 0,
      detail: `inventory=${embeddingReadiness.embeddingProvidersInventory} verified=${embeddingReadiness.embeddingProvidersVerified} configured=${embeddingReadiness.embeddingProvidersConfigured} executable=${embeddingReadiness.embeddingProvidersExecutable}`,
    });

    const toolReadiness = evaluateToolRuntimeReadiness({
      env,
      invocationStore: input.durableStores?.toolInvocations,
      durable: input.durableStores?.isDurable,
    });
    checks.push({
      name: "tool_runtime",
      ready: true,
      detail: `enabled=${toolReadiness.toolRuntimeEnabled} registeredTools=${toolReadiness.registeredTools} toolCapableProviders=${toolReadiness.toolCapableProviders} structuredOutputProviders=${toolReadiness.structuredOutputProviders}`,
    });
    if (toolReadiness.toolRuntimeEnabled && isDurableRuntimeEnabled(env)) {
      checks.push({
        name: "tool_invocation_store",
        ready: true,
        detail: toolReadiness.toolInvocationStore,
      });
    }

    const certProvider = resolveVideoCertificationProviderId(env);
    if (certProvider && String(certProvider) === RUNWAY_VIDEO_SPEC.canonicalProviderId) {
      checks.push({
        name: "runway_video_certification",
        ready: isRunwayLiveCertificationReady(env),
        detail: "VIDEO_CERTIFICATION_PROVIDER=provider.runway credential + enable",
      });
    }
    checks.push({
      name: "async_media_ready",
      ready: videoReadiness.asyncMediaReady,
      detail: "video async provider registration surface available",
    });
  }

  const mongoState = mongoose.connection.readyState;
  checks.push({
    name: "mongodb",
    ready: mongoState === 1,
    detail:
      mongoState === 1
        ? "connected"
        : mongoState === 2
          ? "connecting"
          : mongoState === 3
            ? "disconnecting"
            : "disconnected",
  });

  if (env.NODE_ENV === "production") {
    checks.push({
      name: "demo_tenant_disabled",
      ready: env.ENTERPRISE_API_SEED_DEMO_TENANT === "false",
      detail: "ENTERPRISE_API_SEED_DEMO_TENANT must be false in production",
    });
  }

  if (isDurableRuntimeEnabled(env)) {
    const config = redisConnectionFromEnv(env);
    let redisReady = false;
    let redisDetail = "REDIS_HOST/REDIS_PORT (or REDIES_*) required";
    if (config) {
      redisReady = await pingSharedRedis(env);
      redisDetail = redisReady ? "ping ok" : "unreachable";
    }
    checks.push({
      name: "redis",
      ready: redisReady,
      detail: redisDetail,
    });
    checks.push({
      name: "durable_mode",
      ready: true,
      detail: "ENTERPRISE_API_DURABLE_MODE=true",
    });
  }

  if (isAsyncMediaEnabled(env)) {
    checks.push({
      name: "async_media_enabled",
      ready: true,
      detail: "ENTERPRISE_ASYNC_MEDIA_ENABLED=true",
    });
    if (input.asyncMedia) {
      const ping = await pingAsyncMediaDependencies(input.asyncMedia);
      checks.push({
        name: "provider_operations_store",
        ready: ping.providerOperations,
        detail: ping.providerOperations ? "MongoProviderOperationStore" : "unavailable",
      });
      checks.push({
        name: "blob_storage",
        ready: ping.blobStorage,
        detail: ping.blobStorage ? "S3BlobStorage reachable" : "unreachable",
      });
    } else if (isDurableRuntimeEnabled(env)) {
      checks.push({
        name: "async_media_platform",
        ready: false,
        detail: "async media enabled but platform not composed",
      });
    }
  } else {
    checks.push({
      name: "async_media",
      ready: true,
      detail: "disabled",
    });
  }

  // M9.5O1 — soft streaming readiness (credential-free boot always ready).
  const streamingReadiness = evaluateStreamingReadiness(env);
  checks.push({
    name: "streaming_providers",
    ready: streamingReadiness.ready,
    detail: streamingReadiness.detail,
  });

  const ready = checks.every((c) => c.ready);
  return {
    status: ready ? "ready" : "not_ready",
    executionMode: input.executionMode,
    checks,
    generatedAt: nowIso(),
  };
}
