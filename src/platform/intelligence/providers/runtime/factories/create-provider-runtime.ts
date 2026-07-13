/**
 * Provider runtime factory.
 *
 * Purpose: Wire the ProviderRuntime with in-memory subsystems via DI.
 * Responsibilities: Construct default subsystems; allow overrides.
 * Usage: Primary entry point for constructing a runtime.
 * Future Extension: Durable stores/queues and provider adapters plug in here.
 */

import type { EventFactory } from "../../../events/implementations/event-factory";
import type { IEventBus } from "../../../events/interfaces/event-bus";
import { randomUUID } from "crypto";
import type { CircuitBreakerConfig } from "../contracts/circuit-breaker";
import { CancellationEngine } from "../cancellation/cancellation-engine";
import { CircuitBreakerRegistry } from "../circuit-breaker/circuit-breaker";
import { ConcurrencyManager } from "../concurrency/concurrency-manager";
import { PlaceholderProviderDispatcher } from "../dispatcher/placeholder-dispatcher";
import { ProviderRuntime } from "../engine/provider-runtime";
import {
  EventBusProviderRuntimeEventPublisher,
  NoopProviderRuntimeEventPublisher,
} from "../events/event-publisher";
import type { IProviderDispatcher } from "../interfaces/provider-dispatcher";
import type { IProviderRuntime } from "../interfaces/provider-runtime";
import type { IProviderRuntimeEventPublisher } from "../interfaces/event-publisher";
import { ProviderRuntimeMetrics } from "../metrics/runtime-metrics";
import { InMemoryExecutionQueue } from "../queue/execution-queue";
import { RetryEngine } from "../retry/retry-engine";
import { InMemoryProviderSessionStore } from "../sessions/session-store";
import { StreamingRuntime } from "../streaming/streaming-runtime";
import { TimeoutEngine } from "../timeout/timeout-engine";

export interface CreateProviderRuntimeOptions {
  /** Defaults to the placeholder dispatcher (no vendor SDK). */
  readonly dispatcher?: IProviderDispatcher;
  /** Maximum concurrent executions. Defaults to 8. */
  readonly maxConcurrent?: number;
  readonly circuitBreakerConfig?: CircuitBreakerConfig;
  /** Optional event bus wiring; falls back to a no-op publisher. */
  readonly eventBus?: IEventBus;
  readonly eventFactory?: EventFactory;
  readonly events?: IProviderRuntimeEventPublisher;
  readonly nowIso?: () => string;
  readonly nowMs?: () => number;
  readonly createId?: (prefix: string) => string;
  /** Injectable sleep to keep retry-delay tests deterministic. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export function createProviderRuntime(
  options: CreateProviderRuntimeOptions = {}
): IProviderRuntime {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const nowMs = options.nowMs ?? (() => Date.now());
  const createId =
    options.createId ?? ((prefix: string) => `${prefix}_${randomUUID()}`);
  const sleep =
    options.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        if (typeof timer.unref === "function") {
          timer.unref();
        }
      }));

  const events: IProviderRuntimeEventPublisher =
    options.events ??
    (options.eventBus && options.eventFactory
      ? new EventBusProviderRuntimeEventPublisher(
          options.eventBus,
          options.eventFactory
        )
      : new NoopProviderRuntimeEventPublisher());

  return new ProviderRuntime({
    dispatcher:
      options.dispatcher ?? new PlaceholderProviderDispatcher({ nowIso }),
    queue: new InMemoryExecutionQueue(),
    concurrency: new ConcurrencyManager({
      maxConcurrent: options.maxConcurrent ?? 8,
      nowIso,
      createId,
    }),
    retry: new RetryEngine(),
    timeout: new TimeoutEngine(),
    cancellation: new CancellationEngine(),
    streaming: new StreamingRuntime(nowIso),
    circuitBreakers: new CircuitBreakerRegistry(
      options.circuitBreakerConfig,
      nowIso,
      nowMs
    ),
    events,
    metrics: new ProviderRuntimeMetrics(nowIso),
    store: new InMemoryProviderSessionStore(),
    nowIso,
    nowMs,
    createId,
    sleep,
  });
}
