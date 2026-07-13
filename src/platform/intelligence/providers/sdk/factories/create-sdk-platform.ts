/**
 * SDK platform factory.
 *
 * Purpose: Wire the full SDK platform with in-memory defaults.
 * Responsibilities: Compose engine + registry + subsystems; register placeholders.
 * Usage: `const { engine } = createSdkPlatform();`
 * Future Extension: Selective vendor registration, real SDK wiring.
 *
 * No networking, no SDK packages, no persistence.
 */

import { PlaceholderSdkAuthenticationProvider } from "../authentication/placeholder-auth-provider";
import { DefaultSdkDiagnostics } from "../diagnostics/default-diagnostics";
import { ProviderSdkEngine } from "../engine/sdk-engine";
import { DefaultSdkHealthMonitor } from "../health/default-health-monitor";
import { InMemorySdkRegistry } from "../registry/in-memory-sdk-registry";
import { DefaultSdkRetryEngine } from "../retries/default-retry-engine";
import { DefaultSdkStreamingEngine } from "../streaming/default-streaming-engine";
import { DefaultSdkTimeoutEngine } from "../timeout/default-timeout-engine";
import {
  createAllPlaceholderWrappers,
  type CreateWrapperOptions,
} from "./create-placeholder-wrappers";
import type { IProviderSdkEngine, ISdkEventPublisher } from "../interfaces/engine";
import type { ISdkRegistry } from "../interfaces/registry";
import type { ISdkDiagnostics } from "../interfaces/diagnostics";
import type {
  ISdkAuthenticationProvider,
  ISdkHealthMonitor,
  ISdkStreamingEngine,
} from "../interfaces/engines";

export interface SdkPlatform {
  readonly engine: IProviderSdkEngine;
  readonly registry: ISdkRegistry;
  readonly diagnostics: ISdkDiagnostics;
  readonly healthMonitor: ISdkHealthMonitor;
  readonly streamingEngine: ISdkStreamingEngine;
  readonly authProvider: ISdkAuthenticationProvider;
}

export interface CreateSdkPlatformOptions {
  readonly registerPlaceholders?: boolean;
  readonly wrapperOptions?: CreateWrapperOptions;
  readonly eventPublisher?: ISdkEventPublisher;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly retrySleep?: (ms: number) => Promise<void>;
}

export function createSdkPlatform(
  options: CreateSdkPlatformOptions = {}
): SdkPlatform {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());
  const createId =
    options.createId ?? ((p) => `${p}_${Math.random().toString(36).slice(2)}`);

  const registry = new InMemorySdkRegistry();
  const healthMonitor = new DefaultSdkHealthMonitor(nowIso);
  const authProvider = new PlaceholderSdkAuthenticationProvider();
  const retryEngine = new DefaultSdkRetryEngine(options.retrySleep);
  const timeoutEngine = new DefaultSdkTimeoutEngine();
  const streamingEngine = new DefaultSdkStreamingEngine(nowIso);
  const diagnostics = new DefaultSdkDiagnostics(registry);

  if (options.registerPlaceholders ?? true) {
    for (const wrapper of createAllPlaceholderWrappers({
      ...options.wrapperOptions,
      nowIso,
    })) {
      registry.register(wrapper);
      healthMonitor.markRegistered(wrapper.vendor, true);
    }
  }

  const engine = new ProviderSdkEngine({
    registry,
    retryEngine,
    timeoutEngine,
    healthMonitor,
    authProvider,
    eventPublisher: options.eventPublisher,
    nowIso,
    clockMs,
    createId,
  });

  return {
    engine,
    registry,
    diagnostics,
    healthMonitor,
    streamingEngine,
    authProvider,
  };
}
