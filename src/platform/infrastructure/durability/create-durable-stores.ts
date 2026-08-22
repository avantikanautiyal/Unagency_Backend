/**
 * Factory for M9.4 / M9.4A durable stores — shared across API instances.
 */

import type { IBrandBrainRepository } from "./interfaces/brand-brain-repository";
import type {
  IArtifactRepository,
  IExecutionExtrasRepository,
  IExecutionRepository,
  IIdempotencyStore,
  ITenantUsageStore,
} from "./interfaces/execution-store-ports";
import { isDurableRuntimeEnabled, redisConnectionFromEnv } from "./durable-mode";
import { InMemoryBrandBrainRepository } from "./repositories/in-memory-brand-brain-repository";
import { MongoBrandBrainRepository } from "./repositories/mongo-brand-brain-repository";
import {
  InMemoryArtifactRepository,
  InMemoryExecutionExtrasRepository,
  InMemoryExecutionRepository,
  InMemoryIdempotencyStore,
  InMemoryTenantUsageStore,
} from "./repositories/in-memory-execution-persistence";
import {
  MongoArtifactRepository,
  MongoExecutionExtrasRepository,
  MongoExecutionRepository,
} from "./repositories/mongo-execution-persistence";
import { MongoJobStore } from "./repositories/mongo-job-store";
import {
  createAsyncMediaPlatform,
  isAsyncMediaEnabled,
  type AsyncMediaPlatform,
} from "./create-async-media-platform";
import { InMemoryClaimableJobStore } from "./repositories/in-memory-claimable-job-store";
import { getSharedRedisClient, pingSharedRedis } from "./redis/redis-client-factory";
import {
  RedisIdempotencyStore,
  UnavailableIdempotencyStore,
} from "./redis/redis-idempotency-store";
import {
  RedisTenantUsageStore,
  UnavailableTenantUsageStore,
} from "./redis/redis-tenant-usage-store";
import {
  DistributedRateLimitService,
  UnavailableRateLimitService,
} from "./redis/distributed-rate-limit-service";
import { SharedMemoryKvStore, asKvClient, type KvClient } from "./redis/shared-memory-kv";
import type { IJobStore } from "../execution/interfaces/execution";
import type { IRateLimitService } from "../../api/interfaces";
import type { RateLimitPolicy } from "../../api/contracts";
import type { IModelPerformanceStore } from "../../intelligence/providers/routing/performance/interfaces/model-performance-store";
import { InMemoryModelPerformanceStore } from "../../intelligence/providers/routing/performance/stores/in-memory-model-performance-store";
import { MongoModelPerformanceStore } from "../../intelligence/providers/routing/performance/stores/mongo-model-performance-store";
import type { IToolInvocationStore } from "../../intelligence/providers/tools/idempotency/tool-invocation-store";
import type { OsDurableBundle } from "./create-os-durable-bundle";
import {
  createInMemoryOsDurableBundle,
  createMongoOsDurableBundle,
} from "./create-os-durable-bundle";
import { InMemoryToolInvocationStore } from "../../intelligence/providers/tools/idempotency/in-memory-tool-invocation-store";
import { MongoToolInvocationStore } from "../../intelligence/providers/tools/idempotency/mongo-tool-invocation-store";

export interface DurableStores {
  readonly brandBrain: IBrandBrainRepository;
  readonly executions: IExecutionRepository;
  readonly artifacts: IArtifactRepository;
  readonly extras: IExecutionExtrasRepository;
  readonly idempotency: IIdempotencyStore;
  readonly tenantUsage: ITenantUsageStore;
  readonly toolInvocations: IToolInvocationStore;
  readonly jobStore?: IJobStore;
  readonly rateLimits?: IRateLimitService;
  readonly kv?: KvClient;
  readonly asyncMedia?: AsyncMediaPlatform;
  /** M9.5H — durable provider/model performance evidence. */
  readonly modelPerformance: IModelPerformanceStore;
  readonly os?: OsDurableBundle;
  readonly isDurable: boolean;
  readonly composition?: {
    brandBrain: string;
    executions: string;
    artifacts: string;
    extras: string;
    jobStore: string;
    idempotency: string;
    tenantUsage: string;
    rateLimits: string;
    providerOperations?: string;
    blobStorage?: string;
    modelPerformance?: string;
    toolInvocations?: string;
  };
}

let testSharedKv: SharedMemoryKvStore | undefined;
let testSharedBrandRepo: InMemoryBrandBrainRepository | undefined;
let testSharedExecutionRepo: InMemoryExecutionRepository | undefined;
let testSharedArtifactRepo: InMemoryArtifactRepository | undefined;
let testSharedExtrasRepo: InMemoryExecutionExtrasRepository | undefined;
let testSharedIdempotency: InMemoryIdempotencyStore | undefined;
let testSharedTenantUsage: InMemoryTenantUsageStore | undefined;
let testSharedJobStore: InMemoryClaimableJobStore | undefined;
let testSharedRateLimits: DistributedRateLimitService | undefined;
let testSharedModelPerformance: InMemoryModelPerformanceStore | undefined;
let testSharedToolInvocations: InMemoryToolInvocationStore | undefined;
let testSharedOs: OsDurableBundle | undefined;

/** Test harness — one shared in-memory durable layer simulating Mongo+Redis. */
export function getSharedTestDurableStores(options?: {
  rateLimitPolicies?: readonly RateLimitPolicy[];
}): DurableStores {
  if (!testSharedKv) testSharedKv = new SharedMemoryKvStore();
  if (!testSharedBrandRepo) testSharedBrandRepo = new InMemoryBrandBrainRepository();
  if (!testSharedExecutionRepo) testSharedExecutionRepo = new InMemoryExecutionRepository();
  if (!testSharedArtifactRepo) testSharedArtifactRepo = new InMemoryArtifactRepository();
  if (!testSharedExtrasRepo) testSharedExtrasRepo = new InMemoryExecutionExtrasRepository();
  if (!testSharedIdempotency) testSharedIdempotency = new InMemoryIdempotencyStore();
  if (!testSharedTenantUsage) testSharedTenantUsage = new InMemoryTenantUsageStore();
  if (!testSharedJobStore) testSharedJobStore = new InMemoryClaimableJobStore();
  if (!testSharedModelPerformance) {
    testSharedModelPerformance = new InMemoryModelPerformanceStore();
  }
  if (!testSharedToolInvocations) testSharedToolInvocations = new InMemoryToolInvocationStore();
  if (!testSharedOs) testSharedOs = createInMemoryOsDurableBundle();

  const kv = asKvClient({
    get: (k) => testSharedKv!.get(k),
    set: (k, v, m, t) => testSharedKv!.set(k, v, m, t),
    incrby: (k, n) => testSharedKv!.incrby(k, n),
    del: (k) => testSharedKv!.del(k),
  });

  if (!testSharedRateLimits || options?.rateLimitPolicies) {
    testSharedRateLimits = new DistributedRateLimitService(
      kv,
      () => new Date().toISOString(),
      () => Date.now(),
      options?.rateLimitPolicies
    );
  }

  return {
    brandBrain: testSharedBrandRepo,
    executions: testSharedExecutionRepo,
    artifacts: testSharedArtifactRepo,
    extras: testSharedExtrasRepo,
    idempotency: testSharedIdempotency,
    tenantUsage: testSharedTenantUsage,
    toolInvocations: testSharedToolInvocations,
    jobStore: testSharedJobStore,
    rateLimits: testSharedRateLimits,
    kv,
    modelPerformance: testSharedModelPerformance!,
    os: testSharedOs,
    isDurable: true,
    composition: {
      brandBrain: "InMemoryBrandBrainRepository",
      executions: "InMemoryExecutionRepository",
      artifacts: "InMemoryArtifactRepository",
      extras: "InMemoryExecutionExtrasRepository",
      jobStore: "InMemoryClaimableJobStore",
      idempotency: "InMemoryIdempotencyStore",
      tenantUsage: "InMemoryTenantUsageStore",
      rateLimits: "DistributedRateLimitService",
      modelPerformance: "InMemoryModelPerformanceStore",
      toolInvocations: "InMemoryToolInvocationStore",
    },
  };
}

export function resetSharedTestDurableStores(): void {
  testSharedKv?.clear();
  testSharedBrandRepo?.clear();
  testSharedExecutionRepo?.clear();
  testSharedArtifactRepo?.clear();
  testSharedExtrasRepo?.clear();
  testSharedIdempotency?.clear();
  testSharedTenantUsage?.clear();
  testSharedJobStore?.clear();
  testSharedKv = undefined;
  testSharedBrandRepo = undefined;
  testSharedExecutionRepo = undefined;
  testSharedArtifactRepo = undefined;
  testSharedExtrasRepo = undefined;
  testSharedIdempotency = undefined;
  testSharedTenantUsage = undefined;
  testSharedJobStore = undefined;
  testSharedRateLimits = undefined;
  testSharedModelPerformance?.clear();
  testSharedModelPerformance = undefined;
  testSharedToolInvocations?.clear();
  testSharedToolInvocations = undefined;
  testSharedOs = undefined;
}

export function createDurableStores(
  env: NodeJS.ProcessEnv = process.env,
  options?: { forceInMemory?: boolean; nowIso?: () => string; clockMs?: () => number }
): DurableStores {
  const durable = isDurableRuntimeEnabled(env) && !options?.forceInMemory;
  const nowIso = options?.nowIso ?? (() => new Date().toISOString());
  const clockMs = options?.clockMs ?? (() => Date.now());

  if (!durable) {
    const artifacts = new InMemoryArtifactRepository();
    const tenantUsage = new InMemoryTenantUsageStore();
    const asyncMedia = isAsyncMediaEnabled(env)
      ? createAsyncMediaPlatform({
          env,
          forceInMemory: true,
          artifactsRepo: artifacts,
          tenantUsage,
          nowIso,
          clockMs,
        })
      : undefined;
    return {
      brandBrain: new InMemoryBrandBrainRepository(),
      executions: new InMemoryExecutionRepository(),
      artifacts,
      extras: new InMemoryExecutionExtrasRepository(),
      idempotency: new InMemoryIdempotencyStore(),
      tenantUsage,
      toolInvocations: new InMemoryToolInvocationStore(),
      asyncMedia,
      modelPerformance: new InMemoryModelPerformanceStore(),
      os: createInMemoryOsDurableBundle(),
      isDurable: false,
    };
  }

  const redis = getSharedRedisClient(env);
  const kv = redis ? asKvClient(redis) : undefined;
  void redisConnectionFromEnv(env);
  if (redis) {
    void pingSharedRedis(env);
  }

  const idempotency = kv
    ? new RedisIdempotencyStore(kv)
    : new UnavailableIdempotencyStore();
  const tenantUsage = kv
    ? new RedisTenantUsageStore(kv)
    : new UnavailableTenantUsageStore();
  const rateLimits = kv
    ? new DistributedRateLimitService(kv, nowIso, clockMs)
    : new UnavailableRateLimitService(nowIso);

  if (!kv && env.NODE_ENV === "production") {
    throw new Error(
      "ENTERPRISE_API_DURABLE_MODE=true requires Redis (REDIS_HOST/REDIS_PORT or REDIES_HOST/REDIES_PORT)"
    );
  }

  const artifacts = new MongoArtifactRepository();
  const asyncMedia = isAsyncMediaEnabled(env)
    ? createAsyncMediaPlatform({
        env,
        artifactsRepo: artifacts,
        tenantUsage,
        nowIso,
        clockMs,
      })
    : undefined;

  return {
    brandBrain: new MongoBrandBrainRepository(),
    executions: new MongoExecutionRepository(),
    artifacts,
    extras: new MongoExecutionExtrasRepository(),
    idempotency,
    tenantUsage,
    toolInvocations: new MongoToolInvocationStore(),
    jobStore: new MongoJobStore(),
    rateLimits,
    kv,
    asyncMedia,
    modelPerformance: new MongoModelPerformanceStore(),
    os: createMongoOsDurableBundle(),
    isDurable: true,
    composition: {
      brandBrain: "MongoBrandBrainRepository",
      executions: "MongoExecutionRepository",
      artifacts: "MongoArtifactRepository",
      extras: "MongoExecutionExtrasRepository",
      jobStore: "MongoJobStore",
      idempotency: kv ? "RedisIdempotencyStore" : "UnavailableIdempotencyStore",
      tenantUsage: kv ? "RedisTenantUsageStore" : "UnavailableTenantUsageStore",
      rateLimits: kv ? "DistributedRateLimitService" : "UnavailableRateLimitService",
      providerOperations: asyncMedia?.isProductionBacked
        ? "MongoProviderOperationStore"
        : undefined,
      blobStorage: asyncMedia?.isProductionBacked ? "S3BlobStorage" : undefined,
      modelPerformance: "MongoModelPerformanceStore",
      toolInvocations: "MongoToolInvocationStore",
    },
  };
}
