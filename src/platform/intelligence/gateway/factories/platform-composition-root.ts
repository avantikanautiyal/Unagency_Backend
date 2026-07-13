/**
 * Platform composition root (M1.7).
 *
 * Purpose: Wire the full Intelligence Control Plane for the Gateway.
 * Responsibilities: Compose kernel (via frozen CompositionRoot) + capability,
 * provider, planning, runtime, orchestrator, and gateway.
 * Usage: createIntelligencePlatform() / bootstrapIntelligenceGateway().
 *
 * Note: Kernel CompositionRoot is not modified (M1.1 frozen). This root
 * extends composition for the full control plane.
 */

import { CapabilityRegistry } from "../../capability-registry/implementations/capability-registry";
import type { ICapabilityRegistry } from "../../capability-registry/interfaces/capability-registry";
import { CapabilityCatalog } from "../../capability-catalog/implementations/capability-catalog";
import type { ICapabilityCatalog } from "../../capability-catalog/interfaces/capability-catalog";
import type { IntelligencePlatformConfig } from "../../config";
import { loadIntelligencePlatformConfig } from "../../config";
import type { EventFactory } from "../../events/implementations/event-factory";
import type { IEventBus } from "../../events/interfaces/event-bus";
import { createExecutionPlanningEngine } from "../../execution-planning/factories/create-planning-engine";
import type { IExecutionPlanningEngine } from "../../execution-planning/interfaces/execution-planning-engine";
import { createExecutionRuntime } from "../../execution-runtime/factories/create-execution-runtime";
import type { IExecutionRuntime } from "../../execution-runtime/interfaces/execution-runtime";
import { CompositionRoot } from "../../kernel/composition/composition-root";
import { Tokens } from "../../kernel/composition/tokens";
import type { IPlatformKernel } from "../../kernel/interfaces/kernel";
import { createIntelligenceOrchestrator } from "../../orchestrator/factories/create-orchestrator";
import type { IIntelligenceOrchestrator } from "../../orchestrator/interfaces/intelligence-orchestrator";
import { ProviderCapabilityMatrix } from "../../providers/capability-matrix/implementations/provider-capability-matrix";
import type { IProviderCapabilityMatrix } from "../../providers/capability-matrix/interfaces/provider-capability-matrix";
import { InMemoryProviderHealthStore } from "../../providers/health/in-memory-provider-health-store";
import { ProviderRegistry } from "../../providers/registry/provider-registry";
import type { IProviderRegistry } from "../../providers/registry/provider-registry";
import type { ITelemetry } from "../../telemetry/interfaces/telemetry";
import { GatewayHealthAggregator } from "../health/gateway-health";
import { IntelligenceGateway } from "../implementation/intelligence-gateway";
import type { IIntelligenceGateway } from "../interfaces/intelligence-gateway";
import { GatewayLoggingMiddleware } from "../middleware/gateway-middleware";
import { registerMockPlatformArtifacts } from "../mocks/register-mock-platform";
import { GatewayValidator } from "../validation/gateway-validator";

export interface IntelligencePlatform {
  readonly gateway: IIntelligenceGateway;
  readonly kernel: IPlatformKernel;
  /** Integration harness — not for business modules. */
  readonly harness: {
    readonly runtime: IExecutionRuntime;
    readonly planning: IExecutionPlanningEngine;
    readonly orchestrator: IIntelligenceOrchestrator;
    readonly capabilityRegistry: ICapabilityRegistry;
    readonly capabilityCatalog: ICapabilityCatalog;
    readonly providerRegistry: IProviderRegistry;
    readonly providerCapabilityMatrix: IProviderCapabilityMatrix;
    readonly eventBus: IEventBus;
  };
}

export interface PlatformCompositionOptions {
  readonly config?: IntelligencePlatformConfig;
  readonly registerMocks?: boolean;
}

/**
 * Wires all control-plane modules. Concrete implementations are created only here.
 */
export class PlatformCompositionRoot {
  compose(options: PlatformCompositionOptions = {}): IntelligencePlatform {
    const config = options.config ?? loadIntelligencePlatformConfig();

    // Kernel foundation (frozen CompositionRoot — not modified)
    const kernelRoot = new CompositionRoot();
    const container = kernelRoot.compose({ config });
    const kernel = container.resolve(Tokens.Kernel);
    const eventBus = container.resolve(Tokens.EventBus);
    const eventFactory = container.resolve(Tokens.EventFactory) as EventFactory;
    const telemetry = container.resolve(Tokens.Telemetry) as ITelemetry;

    const capabilityRegistry = new CapabilityRegistry();
    const capabilityCatalog = new CapabilityCatalog(capabilityRegistry);

    const providerHealth = new InMemoryProviderHealthStore();
    const providerCapabilityMatrix = new ProviderCapabilityMatrix();
    const providerRegistry = new ProviderRegistry(
      providerHealth,
      providerCapabilityMatrix
    );

    if (options.registerMocks !== false) {
      registerMockPlatformArtifacts({
        capabilityRegistry,
        providerRegistry,
      });
    }

    const planning = createExecutionPlanningEngine({
      capabilityRegistry,
      providerRegistry,
      providerCapabilityMatrix,
    });

    const runtime = createExecutionRuntime({
      eventBus,
      eventFactory,
    });

    const orchestrator = createIntelligenceOrchestrator({
      runtime,
      logger: telemetry.logger,
    });

    const healthAggregator = new GatewayHealthAggregator({
      kernel,
      capabilityRegistry,
      providerRegistry,
      planningReady: true,
      orchestratorReady: true,
      runtimeReady: true,
      nowIso: () => new Date().toISOString(),
    });

    const gateway = new IntelligenceGateway({
      validator: new GatewayValidator(),
      capabilityRegistry,
      planningEngine: planning,
      orchestrator,
      runtime,
      healthAggregator,
      middleware: [new GatewayLoggingMiddleware(telemetry.logger)],
    });

    return {
      gateway,
      kernel,
      harness: {
        runtime,
        planning,
        orchestrator,
        capabilityRegistry,
        capabilityCatalog,
        providerRegistry,
        providerCapabilityMatrix,
        eventBus,
      },
    };
  }
}

export function createIntelligencePlatform(
  options: PlatformCompositionOptions = {}
): IntelligencePlatform {
  return new PlatformCompositionRoot().compose(options);
}
