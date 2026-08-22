/**
 * Enterprise API Gateway factory.
 * Wires auth, tenants, executions (Distributed Execution), catalog, streaming, rate limits.
 */

import { createDistributedExecutionPlatform } from "../../infrastructure/execution/factories/create-distributed-execution-platform";
import type { IDistributedExecutionEngine } from "../../infrastructure/execution/interfaces/execution";
import type { IIntelligenceOsIntegrationEngine } from "../../intelligence/integration/interfaces/integration";
import type { EnterpriseApiExecutionMode } from "../runtime/execution-mode";
import { resolveEnterpriseApiExecutionMode } from "../runtime/execution-mode";
import {
  createDurableStores,
  assertProductionDurableComposition,
  type DurableStores,
} from "../../infrastructure/durability";
import { isAsyncProviderDispatcher } from "../../intelligence/providers/async/interfaces/async-provider-dispatcher";
import { AsyncExecutionCoordinator } from "../../intelligence/providers/async/coordination/async-execution-coordinator";
import { AsyncReconciliationWorker } from "../../intelligence/providers/async/reconciliation/async-reconciliation-worker";
import { InMemoryProviderRuntimeRegistry } from "../../intelligence/providers/runtime/registry/in-memory-provider-runtime-registry";
import { createModelRegistryPlatform } from "../../intelligence/model-registry/factories/create-model-registry-platform";
import { registerVideoProviders } from "../../production/execution/register-video-providers";
import { registerAudioProviders } from "../../production/execution/register-audio-providers";
import { registerImageProviders } from "../../production/execution/register-image-providers";
import { registerResearchProviders } from "../../production/execution/register-research-providers";
import type { IVideoHttpClient } from "../../intelligence/providers/video/http/video-http-client";
import type { IAudioHttpClient } from "../../intelligence/providers/audio/http/audio-http-client";
import { createVideoExecutionRouter } from "../../intelligence/providers/video/routing/video-execution-router";
import { createImageExecutionRouter } from "../../intelligence/providers/image/routing/image-execution-router";
import { createAudioExecutionRouter } from "../../intelligence/providers/audio/routing/audio-execution-router";
import { createTextExecutionRouter } from "../../intelligence/providers/routing/text/text-execution-router";
import { resolveVideoCertificationAllowedProviderIds } from "../../production/execution/video-certification-config";
import { asProviderId } from "../../intelligence/shared/identifiers";
import { failure } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import { createBrandBrainPlatform } from "../../business/brand-brain/factories/create-brand-brain-platform";
import { InMemoryTelemetryStore } from "../../infrastructure/observability/tracing/in-memory-telemetry-store";
import { InMemoryOsWorkQueue } from "../../os/runtime/queues/in-memory-os-work-queue";
import { createOsProductionRuntime } from "../../os/runtime/os-production-runtime";
import { OsProductionWorker } from "../../os/runtime/os-production-worker";
import { createOsDeliveryService } from "../../os/delivery/engine/delivery-service";
import { BusinessPlatformEngine } from "../../business/engine/business-platform-engine";
import { AsyncFailoverOrchestrator } from "../../intelligence/providers/routing/performance/failover/async-failover-orchestrator";
import { loadProviderFailoverConfig } from "../../intelligence/providers/routing/performance/config/adaptive-routing-config";
import { PerformanceEvidenceWriter } from "../../intelligence/providers/routing/performance/feedback/performance-evidence-writer";
import { InMemoryAuthenticationService } from "../authentication/in-memory-authentication-service";
import {
  CompositeAuthenticationService,
  createCompositeAuthenticationService,
} from "../auth/composite-authentication-service";
import { FirebaseAuthenticationAdapter } from "../auth/firebase/firebase-authentication-adapter";
import { RbacAuthorizationService } from "../authorization/rbac-authorization-service";
import { InMemoryTenantService } from "../tenants/in-memory-tenant-service";
import { BridgedTenantService } from "../tenants/bridged-tenant-service";
import { InMemoryRateLimitService } from "../rate-limits/in-memory-rate-limit-service";
import { InMemoryStreamingService } from "../streaming/in-memory-streaming-service";
import { ExecutionApiService } from "../services/execution-api-service";
import {
  createToolRuntimePlatform,
  type ToolRuntimePlatform,
} from "../../intelligence/providers/tools/composition/tool-runtime-platform";
import type { IProviderDispatcher } from "../../intelligence/providers/runtime/interfaces/provider-dispatcher";
import { ControllableDispatcher } from "../../intelligence/providers/runtime/testing";
import {
  FakeAsyncProviderDispatcher,
  fakeAsyncProviderId,
} from "../../intelligence/providers/async/fake/fake-async-provider";
import { assertProductionComposition } from "../../os";
import { CatalogApiService } from "../services/catalog-api-service";
import { CurrentPrincipalService } from "../services/current-principal-service";
import { ApiGatewayEngine } from "../gateway/api-gateway-engine";
import { ExecutionIntelligenceApiService } from "../execution-intelligence";
import { seedExecutionContextFixtures } from "../../business/execution-context/testing/seed-fixtures";
import type {
  IApiGateway,
  IAuthenticationService,
  IRateLimitService,
  ITenantService,
} from "../interfaces";

export interface EnterpriseApiPlatform {
  readonly gateway: IApiGateway;
  readonly auth: IAuthenticationService;
  readonly platformAuth: InMemoryAuthenticationService;
  readonly tenants: ITenantService;
  readonly tenantStore: InMemoryTenantService;
  readonly executions: ExecutionApiService;
  readonly executionIntelligence: ExecutionIntelligenceApiService;
  readonly streaming: InMemoryStreamingService;
  readonly rateLimits: IRateLimitService;
  readonly catalog: CatalogApiService;
  readonly distributed: IDistributedExecutionEngine;
  /** Routes distributed jobs through IntelligenceGateway once wired. */
  readonly intelligenceGatewayHolder?: import("../../infrastructure/execution/workers/job-executors").IntelligenceGatewayHolder;
  readonly integrationEngine?: IIntelligenceOsIntegrationEngine;
  readonly durableStores?: DurableStores;
  readonly asyncReconciler?: AsyncReconciliationWorker;
  readonly providerRuntimeRegistry?: InMemoryProviderRuntimeRegistry;
  readonly toolRuntime?: ToolRuntimePlatform;
  /** Brand Brain engine exposed for cross-service brand learning. */
  readonly brandBrainEngine: import("../../business/brand-brain/interfaces").IBrandBrainEngine;
  /**
   * Intelligence Gateway — the kernel/control-plane entry point.
   * Wired after async bootstrap; undefined until bootstrapIntelligenceGateway() resolves.
   */
  intelligencePlatform?: import("../../intelligence/gateway/factories/platform-composition-root").IntelligencePlatform;
  /** Shared in-memory telemetry store for cost recording and observability. */
  readonly telemetryStore: import("../../infrastructure/observability/tracing/in-memory-telemetry-store").InMemoryTelemetryStore;
  /** OsProductionRuntime — async task queue. Ready to process tasks once enqueued. */
  readonly osRuntime: import("../../os/runtime/os-production-runtime").OsProductionRuntime;
  /** Background OS worker — delivery + task queue ticks when durable OS bundle is present. */
  readonly osProductionWorker?: OsProductionWorker;
  /** BusinessPlatformEngine — all 26 SaaS domain modules wired to the API gateway. */
  readonly businessPlatform: import("../../business/engine/business-platform-engine").BusinessPlatformEngine;
  readonly seed?: {
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly userId: string;
    readonly email: string;
  };
}

export interface CreateEnterpriseApiOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly distributed?: IDistributedExecutionEngine;
  readonly integration?: IIntelligenceOsIntegrationEngine;
  /** Wire Distributed Execution with Integration Layer (heavier). @deprecated Prefer executionMode */
  readonly useIntegrationLayer?: boolean;
  /** Authoritative execution mode (stub | simulated | live). */
  readonly executionMode?: EnterpriseApiExecutionMode | "integration";
  /** Bootstrap demo org + admin user for local/testing. Default true. */
  readonly seedDemoTenant?: boolean;
  /** Enable Firebase ID token → AuthPrincipal bridge. Default false in factory; enabled at HTTP runtime. */
  readonly enableFirebaseBridge?: boolean;
  /** Pass-through to Integration OS when useIntegrationLayer is true. */
  readonly executionContextStores?: import("../../business/execution-context").IExecutionContextStores;
  readonly useLiveBusinessContext?: boolean;
  /** M9.4 shared durable stores (optional; created from env when durable mode enabled). */
  readonly durableStores?: DurableStores;
  /** Injected provider runtime registry (tests / bootstrapping). */
  readonly providerRuntimeRegistry?: InMemoryProviderRuntimeRegistry;
  /** Pre-composed runtime used for tool execution and approval resumption. */
  readonly toolRuntime?: ToolRuntimePlatform;
  /** Offline tests: mocked vendor HTTP transports keyed by vendor id. */
  readonly videoHttpClientsByVendor?: Readonly<Record<string, IVideoHttpClient>>;
  readonly audioHttpClientsByVendor?: Readonly<Record<string, IAudioHttpClient>>;
  /** Allow FakeAsyncProviderDispatcher only in non-production tests. */
  readonly allowFakeAsyncProvider?: boolean;
  /** Dispatcher shared by the provider and tool runtimes. */
  readonly runtimeDispatcher?: IProviderDispatcher;
  /** Seed deterministic certification tools outside LIVE unless explicitly disabled. */
  readonly seedToolCertificationTools?: boolean;
  /** Phase 2 — injectable brand record source (tests / simulated). */
  readonly brandSource?: import("../../os/brand").IBrandRecordSource;
  /** Phase 3 — injectable knowledge hit source (tests / simulated). */
  readonly knowledgeSource?: import("../../os/knowledge").IKnowledgeHitSource;
  /** Phase 5 — injectable task capability runner (tests). */
  readonly taskCapabilityRunner?: import("../../os/task-graph-executor").ITaskCapabilityRunner;
  /** Phase 5 — shared task graph run store (tests). */
  readonly taskGraphStore?: import("../../os/task-graph-executor").ITaskGraphRunStore;
}

export function createEnterpriseApiPlatform(
  options: CreateEnterpriseApiOptions = {}
): EnterpriseApiPlatform {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());
  let seq = 0;
  const createId =
    options.createId ?? ((p: string) => `${p}_${++seq}_${clockMs()}`);

  const auth = options.enableFirebaseBridge
    ? createCompositeAuthenticationService({
        nowIso,
        createId,
        clockMs,
      })
    : new InMemoryAuthenticationService(nowIso, createId, clockMs);
  const platformAuth =
    auth instanceof CompositeAuthenticationService
      ? auth.platformAuth
      : auth;
  const authorization = new RbacAuthorizationService();
  const tenantStore = new InMemoryTenantService(nowIso, createId);
  const tenants: ITenantService = options.enableFirebaseBridge
    ? new BridgedTenantService(tenantStore)
    : tenantStore;

  if (auth instanceof CompositeAuthenticationService && tenants instanceof BridgedTenantService) {
    auth.setFirebaseAdapter(
      new FirebaseAuthenticationAdapter({ tenants })
    );
  }
  const streaming = new InMemoryStreamingService(nowIso, createId);
  const catalog = new CatalogApiService();
  const executionIntelligence = new ExecutionIntelligenceApiService();

  const executionMode = resolveEnterpriseApiExecutionMode(options);

  const durableStores =
    options.durableStores ??
    createDurableStores(
      {
        ...process.env,
        // Ensure simulated composition sees async media enablement without requiring a separate env flag.
        ...(executionMode === "simulated"
          ? { ENTERPRISE_API_EXECUTION_MODE: "simulated" }
          : {}),
      },
      { nowIso, clockMs }
    );

  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENTERPRISE_API_DURABLE_MODE === "true" &&
    executionMode === "live"
  ) {
    assertProductionDurableComposition(durableStores);
  }

  const rateLimits: IRateLimitService =
    durableStores.isDurable && durableStores.rateLimits
      ? durableStores.rateLimits
      : new InMemoryRateLimitService(nowIso, clockMs);

  // Phase 0: ControllableDispatcher is SIMULATED-only. LIVE must inject a real dispatcher
  // via bootstrapEnterpriseApiRuntimeAsync / bootProductionExecution.
  if (executionMode === "live" && !options.runtimeDispatcher) {
    throw new Error(
      "LIVE createEnterpriseApiPlatform requires runtimeDispatcher — ControllableDispatcher is forbidden"
    );
  }
  const runtimeDispatcher =
    options.runtimeDispatcher ??
    new ControllableDispatcher({ nowIso });
  if (executionMode === "live") {
    assertProductionComposition({
      executionMode: "live",
      runtimeDispatcher,
      negotiationSource: "production",
    });
  }
  const toolRuntime =
    options.toolRuntime ??
    createToolRuntimePlatform({
      invocationStore: durableStores.toolInvocations,
      dispatcher: runtimeDispatcher,
      durable: durableStores.isDurable,
      seedCertificationTools:
        executionMode !== "live"
          ? options.seedToolCertificationTools !== false
          : options.seedToolCertificationTools === true,
      nowIso,
      clockMs,
    });

  let seed: EnterpriseApiPlatform["seed"];
  if (options.seedDemoTenant !== false) {
    const org = tenants.createOrganization("UNAGENCY Demo");
    if (org.ok) {
      const ws = tenants.createWorkspace(org.value.organizationId, "Default");
      const user = tenants.createUser({
        email: "admin@unagency.local",
        displayName: "Platform Admin",
        organizationId: org.value.organizationId,
        roles: ["owner"],
      });
      if (user.ok && ws.ok) {
        platformAuth.seedUser({
          email: "admin@unagency.local",
          password: "admin",
          userId: user.value.userId,
          organizationId: org.value.organizationId,
          roles: ["owner"],
        });
        seed = {
          organizationId: org.value.organizationId,
          workspaceId: ws.value.workspaceId,
          userId: user.value.userId,
          email: "admin@unagency.local",
        };
      }
    }
  }

  const executionContextStores =
    options.executionContextStores ??
    (executionMode !== "live" && seed
      ? seedExecutionContextFixtures({
          organizationId: seed.organizationId,
          userId: seed.userId,
          organizationName: "UNAGENCY Demo",
          userEmail: seed.email,
          userDisplayName: "Platform Admin",
          brand: {
            brandId: `brand_${seed.organizationId}`,
            name: "UNAGENCY Demo Brand",
            toneOfVoice: "professional",
          },
        })
      : undefined);

  let distributed = options.distributed;
  let intelligenceGatewayHolder:
    | import("../../infrastructure/execution/workers/job-executors").IntelligenceGatewayHolder
    | undefined;
  let integrationEngine = options.integration;
  if (!distributed) {
    const distributedPlatform = createDistributedExecutionPlatform({
      nowIso,
      clockMs,
      createId,
      executionMode,
      integration: options.integration,
      executionContextStores,
      useLiveBusinessContext:
        options.useLiveBusinessContext ?? executionMode === "live",
      brandBrainRepository: durableStores.brandBrain,
      jobStore: durableStores.jobStore,
      runtimeDispatcher,
      toolRuntime,
      asyncMedia: durableStores.asyncMedia,
    });
    distributed = distributedPlatform.engine;
    intelligenceGatewayHolder = distributedPlatform.intelligenceGatewayHolder;
    integrationEngine = distributedPlatform.integration ?? integrationEngine;
  }

  const providerRuntimeRegistry =
    options.providerRuntimeRegistry ?? new InMemoryProviderRuntimeRegistry();

  // M10.6 — credential-free simulated async leaf for image/video product UX.
  const useFakeAsync =
    executionMode !== "live" &&
    (options.allowFakeAsyncProvider !== false || executionMode === "simulated");
  const fakeAsyncDispatcher = useFakeAsync
    ? new FakeAsyncProviderDispatcher(
        String(fakeAsyncProviderId()),
        "pending_then_complete",
        2,
        nowIso
      )
    : undefined;
  if (fakeAsyncDispatcher) {
    providerRuntimeRegistry.registerExecutable({
      providerId: fakeAsyncProviderId(),
      dispatcher: fakeAsyncDispatcher,
      status: "available",
      capabilities: ["image.generate", "video.generate"],
    });
  }

  const modelRegistryPlatform = createModelRegistryPlatform({ loadSeed: true });
  const videoRegistration = registerVideoProviders({
    env: process.env,
    executionMode: executionMode === "live" ? "live" : "openai_simulated",
    modelRegistry: modelRegistryPlatform.registry,
    registry: providerRuntimeRegistry,
    blobAccess: durableStores.asyncMedia?.blobAccess,
    nowIso,
    clockMs,
    httpClientsByVendor: options.videoHttpClientsByVendor,
  });
  if (!videoRegistration.ok) {
    throw new Error(`video provider registration failed: ${videoRegistration.error.message}`);
  }

  const audioRegistration = registerAudioProviders({
    env: process.env,
    executionMode: executionMode === "live" ? "live" : "openai_simulated",
    modelRegistry: modelRegistryPlatform.registry,
    registry: providerRuntimeRegistry,
    nowIso,
    clockMs,
    httpClientsByVendor: options.audioHttpClientsByVendor,
  });
  if (!audioRegistration.ok) {
    throw new Error(`audio provider registration failed: ${audioRegistration.error.message}`);
  }

  const imageRegistration = registerImageProviders({
    env: process.env,
    executionMode: executionMode === "live" ? "live" : "openai_simulated",
    modelRegistry: modelRegistryPlatform.registry,
    registry: providerRuntimeRegistry,
    nowIso,
    clockMs,
  });
  if (!imageRegistration.ok) {
    throw new Error(`image provider registration failed: ${imageRegistration.error.message}`);
  }

  const researchRegistration = registerResearchProviders({
    env: process.env,
    executionMode: executionMode === "live" ? "live" : "openai_simulated",
    modelRegistry: modelRegistryPlatform.registry,
    registry: providerRuntimeRegistry,
    nowIso,
    clockMs,
  });
  if (!researchRegistration.ok) {
    throw new Error(
      `research provider registration failed: ${researchRegistration.error.message}`
    );
  }

  const resolveVideoDispatcher = (providerId: string) => {
    const entry = providerRuntimeRegistry.resolveAvailable(asProviderId(providerId));
    if (entry?.dispatcher && isAsyncProviderDispatcher(entry.dispatcher)) {
      return entry.dispatcher;
    }
    return undefined;
  };

  // Brand Brain engine shared by brand learning (refinement signals → brain)
  const brandBrainEngineForLearning = createBrandBrainPlatform({
    nowIso,
    createId,
    repository: durableStores.brandBrain,
  }).engine;

  const osQueue = durableStores.os?.workQueue ?? new InMemoryOsWorkQueue();
  const osRuntimeHolder: {
    runtime?: import("../../os/runtime/os-production-runtime").OsProductionRuntime;
  } = {};
  const useQueuedOsWorkers = Boolean(durableStores.os);
  const osDeliveryService = useQueuedOsWorkers
    ? createOsDeliveryService({
        artifacts: durableStores.os!.artifacts,
        receipts: durableStores.os!.deliveries,
        mode: "queued",
        onQueued: async (receipt) => {
          if (!osRuntimeHolder.runtime) {
            throw new Error("os_runtime_not_ready");
          }
          await osRuntimeHolder.runtime.enqueueDelivery(receipt);
        },
      })
    : undefined;

  const executions = new ExecutionApiService({
    nowIso,
    createId,
    clockMs,
    distributed,
    integration: integrationEngine ?? options.integration,
    executionMode,
    toolRuntime,
    streaming,
    autoTick: true,
    brandSource: options.brandSource,
    knowledgeSource: options.knowledgeSource,
    taskCapabilityRunner: options.taskCapabilityRunner,
    taskGraphStore: options.taskGraphStore ?? durableStores.os?.taskGraph,
    osBundle: durableStores.os,
    deliveryService: osDeliveryService,
    brandBrainEngine: brandBrainEngineForLearning,
    onIntelligenceSnapshot: (snap) => {
      executionIntelligence.attachSnapshot(snap);
      recordSnapshotCost(snap);
    },
    persistence:
      durableStores.isDurable || durableStores.asyncMedia
        ? {
            executions: durableStores.executions,
            artifacts: durableStores.artifacts,
            extras: durableStores.extras,
            idempotency: durableStores.idempotency,
            tenantUsage: durableStores.tenantUsage,
          }
        : undefined,
    asyncMedia: durableStores.asyncMedia,
    videoRouter: createVideoExecutionRouter({
      registry: providerRuntimeRegistry,
      createId,
      nowIso,
      clockMs,
      allowedProviderIds: resolveVideoCertificationAllowedProviderIds(
        process.env,
        providerRuntimeRegistry
      ),
    }),
    imageRouter: createImageExecutionRouter({
      registry: providerRuntimeRegistry,
    }),
    audioRouter: createAudioExecutionRouter({
      registry: providerRuntimeRegistry,
    }),
    textRouter: createTextExecutionRouter({
      registry: providerRuntimeRegistry,
    }),
    nativeStreamDispatchers: (() => {
      try {
        const mod = require("../../intelligence/providers/streaming/composition/compose-native-streaming-dispatchers") as {
          composeNativeStreamingDispatchers: () => ReadonlyMap<string, import("../../intelligence/providers/streaming/interfaces/native-streaming-dispatcher").INativeStreamingDispatcher>;
        };
        return mod.composeNativeStreamingDispatchers();
      } catch {
        return undefined;
      }
    })(),
    asyncCoordinator: durableStores.asyncMedia
      ? (() => {
          const media = durableStores.asyncMedia!;
          const holder: { coordinator?: AsyncExecutionCoordinator } = {};
          const asyncFailover = new AsyncFailoverOrchestrator({
            submitFailover: (input) => {
              if (!holder.coordinator) {
                return Promise.resolve(
                  failure(new ValidationError("async coordinator not ready"))
                );
              }
              return holder.coordinator.submitExecution(input);
            },
            store: media.providerOperations,
            failover: loadProviderFailoverConfig(process.env),
            evidenceWriter: new PerformanceEvidenceWriter(durableStores.modelPerformance),
            nowIso,
            createId,
          });
          holder.coordinator = new AsyncExecutionCoordinator({
            runtime: media.runtime,
            store: media.providerOperations,
            executions: durableStores.executions,
            artifacts: durableStores.artifacts,
            extras: durableStores.extras,
            tenantUsage: durableStores.tenantUsage,
            registry: providerRuntimeRegistry,
            dispatcher: fakeAsyncDispatcher,
            allowFakeDispatcher: Boolean(fakeAsyncDispatcher),
            nowIso,
            createId,
            integration: integrationEngine,
            executionMode,
            onIntelligenceSnapshot: (snap) => {
              executionIntelligence.attachSnapshot(snap);
              recordSnapshotCost(snap);
            },
            asyncFailover,
          });
          return holder.coordinator;
        })()
      : undefined,
  });

  let asyncReconciler: AsyncReconciliationWorker | undefined;
  if (durableStores.asyncMedia?.isProductionBacked) {
    asyncReconciler = new AsyncReconciliationWorker({
      runtime: durableStores.asyncMedia.runtime,
      store: durableStores.asyncMedia.providerOperations,
      workerId: "enterprise-async-reconciler",
      tickIntervalMs: 250,
    });
    asyncReconciler.start(
      (op) => {
        const fromRegistry = resolveVideoDispatcher(op.providerId);
        if (fromRegistry) return fromRegistry;
        if (
          fakeAsyncDispatcher &&
          String(op.providerId) === String(fakeAsyncProviderId())
        ) {
          return fakeAsyncDispatcher;
        }
        return undefined;
      },
      (op) => ({
        requestId: createId("preq"),
        providerId: op.providerId as never,
        capabilityId: op.capabilityId as never,
        modelId: op.modelId,
        payload: { prompt: "async" },
        context: {
          executionId: op.executionId as never,
          organizationId: op.organizationId as never,
          workspaceId: op.workspaceId as never,
          providerId: op.providerId as never,
          planId: "plan_default",
          correlationId: op.executionId,
        },
        retryPolicy: { strategy: "none", maxAttempts: 1, baseDelayMs: 0 },
        timeoutPolicy: { executionTimeoutMs: 3_600_000 },
        streaming: false,
        priority: 0,
        createdAt: nowIso(),
      })
    );
  }
  // Simulated/in-memory: GET /executions/:id triggers on-demand reconcile (no background timer).

  const gateway = new ApiGatewayEngine({
    auth,
    authorization,
    tenants,
    executions,
    executionIntelligence,
    streaming,
    rateLimits,
    catalog,
    currentPrincipal: new CurrentPrincipalService({ tenants }),
    nowIso,
    clockMs,
  });

  // BusinessPlatformEngine — all 26 SaaS domain modules, connected to the API gateway.
  // Gateway must be constructed first (above), then passed here.
  const businessPlatform = new BusinessPlatformEngine({
    gateway,
    nowIso,
    clockMs,
    createId,
  });

  // Shared telemetry store — cost records written here by ExecutionApiService callbacks.
  const telemetryStore = new InMemoryTelemetryStore();

  const recordSnapshotCost = (snap: import("../execution-intelligence/contracts/responses").ExecutionIntelligenceSnapshot): void => {
    const amount = snap.costs?.totalCost ?? null;
    telemetryStore.addCost({
      recordId: snap.executionId ?? createId("cost"),
      at: nowIso(),
      context: {
        correlationId: snap.executionId ?? "unknown",
        traceId: snap.executionId ?? "unknown",
        organizationId: snap.organizationId ?? "unknown",
        workspaceId: snap.workspaceId ?? "default",
        capabilityId: snap.capabilityId,
        providerId: snap.providerId,
        modelId: snap.modelId,
      },
      amount,
      currency: snap.costs?.currency ?? "USD",
      providerId: snap.providerId,
      modelId: snap.modelId,
      capabilityId: snap.capabilityId,
    });
  };

  // OsProductionRuntime — async task + delivery queue workers.
  const osRuntime = durableStores.os
    ? createOsProductionRuntime({
        queue: osQueue,
        executor: executions.getTaskGraphExecutor(),
        delivery: executions.getDeliveryService(),
        resolvePlan: (executionId, organizationId) =>
          executions.resolveExecutionPlanForWorker(executionId, organizationId),
        nowIso,
        clockMs,
      })
    : createOsProductionRuntime({
        queue: new InMemoryOsWorkQueue(),
        executor: {
          processQueuedTask: async () => ({
            claimed: false as const,
            snapshot: undefined as unknown as import("../../os/task-graph-executor/contracts/task-graph-state").TaskGraphRunSnapshot,
            reason: "executor_not_wired",
          }),
        } as unknown as import("../../os/task-graph-executor/engine/task-graph-executor-engine").ITaskGraphExecutorEngine,
        delivery: null as unknown as import("../../os/delivery/engine/delivery-service").OsDeliveryService,
        resolvePlan: async () => undefined,
        nowIso,
        clockMs,
      });
  osRuntimeHolder.runtime = osRuntime;

  let osProductionWorker: OsProductionWorker | undefined;
  if (useQueuedOsWorkers) {
    osProductionWorker = new OsProductionWorker({
      runtime: osRuntime,
      workerId: "enterprise-os-worker",
      tickIntervalMs: 500,
    });
    osProductionWorker.start();
  }

  return {
    gateway,
    auth,
    platformAuth,
    tenants,
    tenantStore,
    executions,
    executionIntelligence,
    streaming,
    rateLimits,
    catalog,
    distributed,
    intelligenceGatewayHolder,
    integrationEngine: integrationEngine ?? options.integration,
    durableStores,
    toolRuntime,
    asyncReconciler,
    providerRuntimeRegistry,
    brandBrainEngine: brandBrainEngineForLearning,
    telemetryStore,
    osRuntime,
    osProductionWorker,
    businessPlatform,
    seed,
  };
}
