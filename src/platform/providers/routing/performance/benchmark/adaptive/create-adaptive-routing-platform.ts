/**
 * Step 13 — Adaptive routing platform composition (persistence + capability + startup validation).
 */

import type { ICompatibilityEngine, IModelRegistry } from "../../../../../model-registry/interfaces/model-registry";
import { DefaultCompatibilityEngine } from "../../../../../model-registry/compatibility/default-compatibility-engine";
import type { IProviderRuntimeRegistry } from "../../../../runtime/registry/in-memory-provider-runtime-registry";
import type { IBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import { defaultBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import {
  InMemoryRoutingPolicyStore,
  type IRoutingPolicyStore,
} from "./routing-policy-store";
import {
  InMemoryAdaptiveRoutingDecisionStore,
  type IAdaptiveRoutingDecisionStore,
} from "./adaptive-routing-decision-store";
import { MongoRoutingPolicyStore } from "./mongo-routing-policy-store";
import { MongoAdaptiveRoutingDecisionStore } from "./mongo-adaptive-routing-decision-store";
import {
  InMemoryAdaptiveRollbackStore,
  MongoAdaptiveRollbackStore,
  type IAdaptiveRollbackStore,
} from "./adaptive-rollback-store";
import {
  createAdaptiveCandidateExecutableChecker,
  verifyAdaptiveCandidateCapability,
} from "./adaptive-candidate-capability";
import { validateActivePoliciesAtStartup } from "./adaptive-policy-validator";
import { createRoutingPolicyService } from "./routing-policy-service";
import type { AdaptiveRoutingDecisionServiceDeps } from "./adaptive-routing-decision-service";
import { resolveAdaptiveRoutingSafety, adaptiveRoutingMustFailClosed } from "./adaptive-routing-safety";
import { logAdaptiveMetric } from "./adaptive-routing-logger";

export type AdaptiveRoutingPlatform = {
  readonly policyStore: IRoutingPolicyStore;
  readonly decisionStore: IAdaptiveRoutingDecisionStore;
  readonly rollbackStore: IAdaptiveRollbackStore;
  readonly decisionDeps: AdaptiveRoutingDecisionServiceDeps;
  readonly persistenceAvailable: boolean;
};

export type CreateAdaptiveRoutingPlatformInput = {
  readonly env?: NodeJS.ProcessEnv;
  readonly providerRegistry: IProviderRuntimeRegistry;
  readonly modelRegistry: IModelRegistry;
  readonly compatibilityEngine?: ICompatibilityEngine;
  readonly recordStore?: IBenchmarkPerformanceRecordStore;
  readonly policyStore?: IRoutingPolicyStore;
  readonly decisionStore?: IAdaptiveRoutingDecisionStore;
  readonly rollbackStore?: IAdaptiveRollbackStore;
  readonly useMongoPersistence?: boolean;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
};

export function composeAdaptiveRoutingPlatform(
  input: CreateAdaptiveRoutingPlatformInput,
): AdaptiveRoutingPlatform {
  const env = input.env ?? process.env;
  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
  const useMongo = input.useMongoPersistence === true;

  const policyStore: IRoutingPolicyStore =
    input.policyStore ??
    (useMongo ? new MongoRoutingPolicyStore() : new InMemoryRoutingPolicyStore());
  const decisionStore: IAdaptiveRoutingDecisionStore =
    input.decisionStore ??
    (useMongo ? new MongoAdaptiveRoutingDecisionStore() : new InMemoryAdaptiveRoutingDecisionStore());
  const rollbackStore: IAdaptiveRollbackStore =
    input.rollbackStore ??
    (useMongo ? new MongoAdaptiveRollbackStore() : new InMemoryAdaptiveRollbackStore());
  const compatibilityEngine = input.compatibilityEngine ?? new DefaultCompatibilityEngine();

  const persistenceAvailable = useMongo;
  const safety = resolveAdaptiveRoutingSafety({ env, persistenceAvailable });

  const isCandidateExecutable = createAdaptiveCandidateExecutableChecker({
    providerRegistry: input.providerRegistry,
    modelRegistry: input.modelRegistry,
    compatibilityEngine,
  });

  const decisionDeps: AdaptiveRoutingDecisionServiceDeps = Object.freeze({
    recordStore: input.recordStore ?? defaultBenchmarkPerformanceRecordStore,
    policyStore,
    decisionStore,
    env,
    createId,
    nowIso,
    providerRegistry: input.providerRegistry,
    modelRegistry: input.modelRegistry,
    compatibilityEngine,
    isCandidateExecutable: (ctx) => isCandidateExecutable(ctx),
    verifyCandidateCapability: (ctx) =>
      verifyAdaptiveCandidateCapability({
        context: ctx,
        providerRegistry: input.providerRegistry,
        modelRegistry: input.modelRegistry,
        compatibilityEngine,
      }),
    rollbackStore,
    persistenceAvailable,
    failClosedWhenEnabledWithoutPersistence: adaptiveRoutingMustFailClosed(safety),
  });

  return Object.freeze({
    policyStore,
    decisionStore,
    rollbackStore,
    decisionDeps,
    persistenceAvailable,
  });
}

/** Startup hook — validate ACTIVE policies and pause invalid ones (fail closed). */
export async function bootstrapAdaptiveRoutingAtStartup(
  platform: AdaptiveRoutingPlatform,
  input: {
    readonly providerRegistry: IProviderRuntimeRegistry;
    readonly modelRegistry: IModelRegistry;
    readonly compatibilityEngine: ICompatibilityEngine;
    readonly nowIso?: () => string;
  },
): Promise<{ readonly invalidCount: number }> {
  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const policyService = createRoutingPolicyService({ store: platform.policyStore });
  const activePolicies = await platform.policyStore.query({
    lifecycle: "ACTIVE",
    enabled: true,
    limit: 1000,
  });
  const startup = await validateActivePoliciesAtStartup({
    policies: activePolicies,
    nowIso,
    providerRegistry: input.providerRegistry,
    modelRegistry: input.modelRegistry,
    compatibilityEngine: input.compatibilityEngine,
    onInvalid: async (result) => {
      await policyService.pausePolicy({
        policyId: result.policyId,
        reason: `startup validation: ${result.reasons.join("; ")}`,
        nowIso,
      });
      logAdaptiveMetric("invalid_policy", {
        policyId: result.policyId,
        reason: result.reasons.join("; "),
      });
    },
  });
  return Object.freeze({ invalidCount: startup.invalid.length });
}

/** @deprecated Use composeAdaptiveRoutingPlatform + bootstrapAdaptiveRoutingAtStartup */
export async function createAdaptiveRoutingPlatform(
  input: CreateAdaptiveRoutingPlatformInput,
): Promise<AdaptiveRoutingPlatform & { readonly startupInvalidPolicyCount: number }> {
  const platform = composeAdaptiveRoutingPlatform(input);
  const startup = await bootstrapAdaptiveRoutingAtStartup(platform, input);
  return Object.freeze({
    ...platform,
    startupInvalidPolicyCount: startup.invalidCount,
  });
}
