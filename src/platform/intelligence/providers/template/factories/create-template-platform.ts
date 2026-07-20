/**
 * Template platform factory.
 */

import { DefaultCapabilityMapper } from "../models/default-capability-mapper";
import { InMemoryModelMapper } from "../models/default-model-mapper";
import { DefaultDiagnostics } from "../diagnostics/default-diagnostics";
import { TemplateProviderEngine } from "../engine/template-provider-engine";
import { DefaultHealthEngine } from "../health/default-health-engine";
import { DefaultMetricsCollector } from "../metrics/default-metrics-collector";
import { DefaultErrorMapper } from "../responses/default-error-mapper";
import { DefaultUsageMapper } from "../responses/default-usage-mapper";
import { TemplateProviderRegistry } from "../registry/template-provider-registry";
import { AbstractStreamingEngine } from "../streaming/abstract-streaming-engine";
import type { CanonicalModel } from "../../../model-registry/contracts/model";
import type { IProviderTemplateEngine } from "../interfaces/provider-template";
import { AcmeProviderFactory } from "../examples/skeleton-provider";

export interface TemplatePlatform {
  readonly engine: IProviderTemplateEngine;
  readonly registry: TemplateProviderRegistry;
  readonly metrics: DefaultMetricsCollector;
  readonly errorMapper: DefaultErrorMapper;
  readonly usageMapper: DefaultUsageMapper;
  readonly streaming: AbstractStreamingEngine;
  readonly capabilityMapper: DefaultCapabilityMapper;
}

export interface CreateTemplatePlatformOptions {
  readonly models?: readonly CanonicalModel[];
  readonly registerSkeleton?: boolean;
  readonly nowIso?: () => string;
}

export function createTemplatePlatform(
  options: CreateTemplatePlatformOptions = {}
): TemplatePlatform {
  const registry = new TemplateProviderRegistry();
  const modelMapper = new InMemoryModelMapper(options.models ?? []);
  let engineRef: TemplateProviderEngine | undefined;
  const lifecyclePhase = () =>
    engineRef?.getLifecycle().currentPhase ?? "uninitialized";
  const health = new DefaultHealthEngine(lifecyclePhase, options.nowIso);
  const diagnostics = new DefaultDiagnostics();
  const engine = new TemplateProviderEngine({
    health,
    diagnostics,
    modelMapper,
    nowIso: options.nowIso,
  });
  engineRef = engine;

  if (options.registerSkeleton !== false) {
    registry.register(new AcmeProviderFactory());
  }

  return {
    engine,
    registry,
    metrics: new DefaultMetricsCollector(),
    errorMapper: new DefaultErrorMapper(),
    usageMapper: new DefaultUsageMapper(),
    streaming: new (class extends AbstractStreamingEngine {})(),
    capabilityMapper: new DefaultCapabilityMapper(),
  };
}
