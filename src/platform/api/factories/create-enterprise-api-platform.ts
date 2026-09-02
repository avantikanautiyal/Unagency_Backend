/**
 * Enterprise API Gateway factory.
 * Wires auth, tenants, executions (Distributed Execution), catalog, streaming, rate limits.
 */

import { createDistributedExecutionPlatform } from "../../infrastructure/execution/factories/create-distributed-execution-platform";
import type { IDistributedExecutionEngine } from "../../infrastructure/execution/interfaces/execution";
import type { IDirectExecutionEngine } from "../../direct/contracts";
import type { EnterpriseApiExecutionMode } from "../runtime/execution-mode";
import { resolveEnterpriseApiExecutionMode } from "../runtime/execution-mode";
import {
  createDurableStores,
  assertProductionDurableComposition,
  durableStoresUseMongoPersistence,
  type DurableStores,
} from "../../infrastructure/durability";
import { isAsyncProviderDispatcher } from "../../providers/async/interfaces/async-provider-dispatcher";
import { AsyncExecutionCoordinator } from "../../providers/async/coordination/async-execution-coordinator";
import { AsyncReconciliationWorker } from "../../providers/async/reconciliation/async-reconciliation-worker";
import { InMemoryProviderRuntimeRegistry } from "../../providers/runtime/registry/in-memory-provider-runtime-registry";
import { createModelRegistryPlatform } from "../../model-registry/factories/create-model-registry-platform";
import { registerVideoProviders } from "../../production/execution/register-video-providers";
import { registerAudioProviders } from "../../production/execution/register-audio-providers";
import { registerImageProviders } from "../../production/execution/register-image-providers";
import { registerResearchProviders } from "../../production/execution/register-research-providers";
import type { IVideoHttpClient } from "../../providers/video/http/video-http-client";
import type { IAudioHttpClient } from "../../providers/audio/http/audio-http-client";
import { createVideoExecutionRouter } from "../../providers/video/routing/video-execution-router";
import { createImageExecutionRouter } from "../../providers/image/routing/image-execution-router";
import { createAudioExecutionRouter } from "../../providers/audio/routing/audio-execution-router";
import { createTextExecutionRouter } from "../../providers/routing/text/text-execution-router";
import { resolveVideoCertificationAllowedProviderIds } from "../../production/execution/video-certification-config";
import { asProviderId } from "../../core/identifiers";
import { failure } from "../../core/result";
import { ValidationError } from "../../core/errors";
import { InMemoryTelemetryStore } from "../../infrastructure/observability/tracing/in-memory-telemetry-store";
import { InMemoryOsWorkQueue } from "../../os/runtime/queues/in-memory-os-work-queue";
import { createOsProductionRuntime } from "../../os/runtime/os-production-runtime";
import { OsProductionWorker } from "../../os/runtime/os-production-worker";
import { createOsDeliveryService } from "../../os/delivery/engine/delivery-service";
import { BusinessPlatformEngine } from "../../business/engine/business-platform-engine";
import { AsyncFailoverOrchestrator } from "../../providers/routing/performance/failover/async-failover-orchestrator";
import { loadProviderFailoverConfig } from "../../providers/routing/performance/config/adaptive-routing-config";
import { composeAdaptiveRoutingPlatform } from "../../providers/routing/performance/benchmark/adaptive/create-adaptive-routing-platform";
import { DefaultCompatibilityEngine } from "../../model-registry/compatibility/default-compatibility-engine";
import type { ICompatibilityEngine, IModelRegistry } from "../../model-registry/interfaces/model-registry";
import { PerformanceEvidenceWriter } from "../../providers/routing/performance/feedback/performance-evidence-writer";
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
} from "../../providers/tools/composition/tool-runtime-platform";
import type { IProviderDispatcher } from "../../providers/runtime/interfaces/provider-dispatcher";
import { ControllableDispatcher } from "../../providers/runtime/testing";
import {
  FakeAsyncProviderDispatcher,
  fakeAsyncProviderId,
} from "../../providers/async/fake/fake-async-provider";
import { assertProductionComposition } from "../../os";
import { CatalogApiService } from "../services/catalog-api-service";
import { CurrentPrincipalService } from "../services/current-principal-service";
import { ApiGatewayEngine } from "../gateway/api-gateway-engine";
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
  readonly streaming: InMemoryStreamingService;
  readonly rateLimits: IRateLimitService;
  readonly catalog: CatalogApiService;
  readonly distributed: IDistributedExecutionEngine;
  readonly integrationEngine?: IDirectExecutionEngine;
  readonly durableStores?: DurableStores;
  readonly asyncReconciler?: AsyncReconciliationWorker;
  readonly providerRuntimeRegistry?: InMemoryProviderRuntimeRegistry;
  readonly toolRuntime?: ToolRuntimePlatform;
  readonly telemetryStore: import("../../infrastructure/observability/tracing/in-memory-telemetry-store").InMemoryTelemetryStore;
  /** OsProductionRuntime — async task queue. Ready to process tasks once enqueued. */
  readonly osRuntime: import("../../os/runtime/os-production-runtime").OsProductionRuntime;
  /** Background OS worker — delivery + task queue ticks when durable OS bundle is present. */
  readonly osProductionWorker?: OsProductionWorker;
  /** BusinessPlatformEngine — all 26 SaaS domain modules wired to the API gateway. */
  readonly businessPlatform: import("../../business/engine/business-platform-engine").BusinessPlatformEngine;
  readonly adaptiveRoutingPlatform?: import("../../providers/routing/performance/benchmark/adaptive/create-adaptive-routing-platform").AdaptiveRoutingPlatform;
  readonly modelRegistry?: IModelRegistry;
  readonly compatibilityEngine?: ICompatibilityEngine;
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
  readonly integration?: IDirectExecutionEngine;
  /** Wire Distributed Execution with Integration Layer (heavier). @deprecated Prefer executionMode */
  readonly useIntegrationLayer?: boolean;
  /** Authoritative execution mode (stub | simulated | live). */
  readonly executionMode?: EnterpriseApiExecutionMode | "integration";
  /** Bootstrap demo org + admin user for local/testing. Default true. */
  readonly seedDemoTenant?: boolean;
  /** Enable Firebase ID token → AuthPrincipal bridge. Default false in factory; enabled at HTTP runtime. */
  readonly enableFirebaseBridge?: boolean;
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

  let distributed = options.distributed;
  let integrationEngine = options.integration;
  if (!distributed) {
    const distributedPlatform = createDistributedExecutionPlatform({
      nowIso,
      clockMs,
      createId,
      executionMode,
      integration: options.integration,
      jobStore: durableStores.jobStore,
      runtimeDispatcher,
      toolRuntime,
      asyncMedia: durableStores.asyncMedia,
    });
    distributed = distributedPlatform.engine;
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
  const compatibilityEngine = new DefaultCompatibilityEngine();
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

  const adaptiveRoutingPlatform = composeAdaptiveRoutingPlatform({
    env: process.env,
    providerRegistry: providerRuntimeRegistry,
    modelRegistry: modelRegistryPlatform.registry,
    compatibilityEngine: compatibilityEngine,
    useMongoPersistence: durableStoresUseMongoPersistence(durableStores),
    nowIso,
    createId,
  });

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
    osBundle: durableStores.os,
    deliveryService: osDeliveryService,
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
    adaptiveRouting: adaptiveRoutingPlatform.decisionDeps,
    nativeStreamDispatchers: (() => {
      try {
        const mod = require("../../providers/streaming/composition/compose-native-streaming-dispatchers") as {
          composeNativeStreamingDispatchers: () => ReadonlyMap<string, import("../../providers/streaming/interfaces/native-streaming-dispatcher").INativeStreamingDispatcher>;
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

  // Shared telemetry store — populated by execution extras / cost endpoints when recorded.
  const telemetryStore = new InMemoryTelemetryStore();

  const osRuntime = durableStores.os
    ? createOsProductionRuntime({
        queue: osQueue,
        delivery: executions.getDeliveryService(),
        nowIso,
        clockMs,
      })
    : createOsProductionRuntime({
        queue: new InMemoryOsWorkQueue(),
        delivery: null as unknown as import("../../os/delivery/engine/delivery-service").OsDeliveryService,
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
    streaming,
    rateLimits,
    catalog,
    distributed,
    integrationEngine: integrationEngine ?? options.integration,
    durableStores,
    toolRuntime,
    asyncReconciler,
    providerRuntimeRegistry,
    telemetryStore,
    osRuntime,
    osProductionWorker,
    businessPlatform,
    adaptiveRoutingPlatform,
    modelRegistry: modelRegistryPlatform.registry,
    compatibilityEngine,
    seed,
  };
}
