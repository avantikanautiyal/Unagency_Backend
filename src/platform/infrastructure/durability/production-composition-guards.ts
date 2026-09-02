/**
 * Production composition guards — refuse local-only safety stores in durable LIVE.
 */

import type { DurableStores } from "./create-durable-stores";

const REQUIRED_PRODUCTION_COMPOSITION = {
  executions: "MongoExecutionRepository",
  artifacts: "MongoArtifactRepository",
  extras: "MongoExecutionExtrasRepository",
  jobStore: "MongoJobStore",
  idempotency: "RedisIdempotencyStore",
  tenantUsage: "RedisTenantUsageStore",
  rateLimits: "DistributedRateLimitService",
  providerOperations: "MongoProviderOperationStore",
  blobStorage: "S3BlobStorage",
  toolInvocations: "MongoToolInvocationStore",
} as const;

export function assertProductionDurableComposition(
  stores: DurableStores,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (env.NODE_ENV !== "production") return;
  if (env.ENTERPRISE_API_DURABLE_MODE !== "true") return;
  if (env.ENTERPRISE_API_EXECUTION_MODE !== "live") return;

  if (!stores.isDurable || !stores.composition) {
    throw new Error(
      "Production LIVE durable mode requires durable composition metadata"
    );
  }

  for (const [key, expected] of Object.entries(REQUIRED_PRODUCTION_COMPOSITION)) {
    if (key === "providerOperations" || key === "blobStorage") {
      if (env.ENTERPRISE_ASYNC_MEDIA_ENABLED !== "true") continue;
    }
    if (key === "toolInvocations") {
      const toolsEnabled = (env.TOOL_EXECUTION_ENABLED ?? "true").toLowerCase() !== "false";
      if (!toolsEnabled) continue;
    }
    const actual = stores.composition[key as keyof typeof stores.composition];
    if (actual !== expected) {
      throw new Error(
        `Production LIVE composition violation: ${key} expected ${expected}, got ${actual}`
      );
    }
  }

  if (env.ENTERPRISE_ASYNC_MEDIA_ENABLED === "true" && !stores.asyncMedia?.isProductionBacked) {
    throw new Error(
      "Production LIVE async media requires MongoProviderOperationStore and S3BlobStorage"
    );
  }

  if (!stores.jobStore || typeof stores.jobStore.tryClaim !== "function") {
    throw new Error("Production LIVE requires claim-capable job store");
  }
}

export { REQUIRED_PRODUCTION_COMPOSITION };
