/**
 * Transport platform factory.
 *
 * Purpose: Wire the full transport platform with in-memory defaults.
 * Responsibilities: Compose engine + pipeline + dispatcher + subsystems.
 * Usage: `const { engine } = createTransportPlatform();`
 * Future Extension: Register concrete protocol clients (HTTP/SDK/gRPC/...).
 *
 * No networking, no SDKs, no persistence. The default "local" client is an
 * in-process, provider-independent transport suitable for tests + local runtime.
 */

import { InMemoryConnectionManager } from "../connection/in-memory-connection-manager";
import { InMemoryTransportClientRegistry } from "../clients/client-registry";
import {
  LocalTransportClient,
  type LocalTransportHandler,
} from "../clients/local-transport-client";
import {
  GrpcTransportClientPlaceholder,
  HttpTransportClientPlaceholder,
  SdkTransportClientPlaceholder,
  SseTransportClientPlaceholder,
  WebSocketTransportClientPlaceholder,
} from "../clients/placeholder-clients";
import { IdentityCompressor } from "../compression/identity-compressor";
import { DefaultTransportDiagnostics } from "../diagnostics/default-diagnostics";
import { TransportDispatcher } from "../dispatcher/transport-dispatcher";
import { ProviderTransportEngine } from "../engine/transport-engine";
import { DefaultTransportHealthMonitor } from "../health/default-health-monitor";
import { DefaultTransportRetryEngine } from "../retry/default-retry-engine";
import { DefaultTransportTimeoutEngine } from "../timeout/default-timeout-engine";
import { DefaultTransportStreamingEngine } from "../streaming/default-streaming-engine";
import { DefaultTransportSerializer } from "../serializers/default-serializer";
import { DefaultTransportDeserializer } from "../deserializers/default-deserializer";
import { TransportPipeline } from "../pipeline/transport-pipeline";
import {
  AuthPlaceholderMiddleware,
  CompressionMiddleware,
  LoggingMiddleware,
  MetricsMiddleware,
  TracingMiddleware,
  type TransportLogger,
} from "../middleware/built-in";
import type { ITransportClientRegistry } from "../interfaces/clients";
import type { IConnectionManager } from "../interfaces/connection";
import type { ITransportDiagnostics } from "../interfaces/diagnostics";
import type {
  IProviderTransportEngine,
  ITransportDispatcher,
  ITransportEventPublisher,
  ITransportMiddleware,
  ITransportPipeline,
} from "../interfaces/engine";
import type {
  ITransportHealthMonitor,
  ITransportStreamingEngine,
  TransportRetryPolicy,
} from "../interfaces/engines";
import type {
  ITransportDeserializer,
  ITransportSerializer,
} from "../interfaces/serde";

export interface TransportPlatform {
  readonly engine: IProviderTransportEngine;
  readonly pipeline: ITransportPipeline;
  readonly dispatcher: ITransportDispatcher;
  readonly clientRegistry: ITransportClientRegistry;
  readonly connectionManager: IConnectionManager;
  readonly diagnostics: ITransportDiagnostics;
  readonly healthMonitor: ITransportHealthMonitor;
  readonly streamingEngine: ITransportStreamingEngine;
  readonly serializer: ITransportSerializer;
  readonly deserializer: ITransportDeserializer;
}

export interface CreateTransportPlatformOptions {
  readonly localHandler?: LocalTransportHandler;
  readonly middlewares?: readonly ITransportMiddleware[];
  readonly retryPolicy?: TransportRetryPolicy;
  readonly eventPublisher?: ITransportEventPublisher;
  readonly logger?: TransportLogger;
  readonly registerPlaceholders?: boolean;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly retrySleep?: (ms: number) => Promise<void>;
}

export function createTransportPlatform(
  options: CreateTransportPlatformOptions = {}
): TransportPlatform {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());
  const createId =
    options.createId ?? ((p) => `${p}_${Math.random().toString(36).slice(2)}`);

  const connectionManager = new InMemoryConnectionManager(nowIso, createId);
  const diagnostics = new DefaultTransportDiagnostics({ connectionManager });

  const clientRegistry = new InMemoryTransportClientRegistry();
  clientRegistry.register(new LocalTransportClient(options.localHandler, nowIso));
  if (options.registerPlaceholders ?? true) {
    clientRegistry.register(new HttpTransportClientPlaceholder(nowIso));
    clientRegistry.register(new SdkTransportClientPlaceholder(nowIso));
    clientRegistry.register(new GrpcTransportClientPlaceholder(nowIso));
    clientRegistry.register(new WebSocketTransportClientPlaceholder(nowIso));
    clientRegistry.register(new SseTransportClientPlaceholder(nowIso));
  }

  const serializer = new DefaultTransportSerializer(nowIso);
  const deserializer = new DefaultTransportDeserializer(nowIso);
  const retryEngine = new DefaultTransportRetryEngine(options.retrySleep);
  const timeoutEngine = new DefaultTransportTimeoutEngine();
  const healthMonitor = new DefaultTransportHealthMonitor(nowIso);
  const streamingEngine = new DefaultTransportStreamingEngine(nowIso);

  const defaultMiddlewares: ITransportMiddleware[] = [
    new LoggingMiddleware(options.logger),
    new MetricsMiddleware(diagnostics, clockMs),
    new TracingMiddleware(),
    new CompressionMiddleware(new IdentityCompressor(), "none", diagnostics),
    new AuthPlaceholderMiddleware(),
  ];
  const middlewares = [...defaultMiddlewares, ...(options.middlewares ?? [])];

  const dispatcher = new TransportDispatcher({
    clientRegistry,
    retryEngine,
    timeoutEngine,
    middlewares,
    healthMonitor,
    retryPolicy: options.retryPolicy,
  });

  const pipeline = new TransportPipeline({
    serializer,
    deserializer,
    dispatcher,
    connectionManager,
    diagnostics,
    nowIso,
    clockMs,
    createId,
  });

  const engine = new ProviderTransportEngine({
    pipeline,
    healthMonitor,
    eventPublisher: options.eventPublisher,
    nowIso,
    createId,
  });

  return {
    engine,
    pipeline,
    dispatcher,
    clientRegistry,
    connectionManager,
    diagnostics,
    healthMonitor,
    streamingEngine,
    serializer,
    deserializer,
  };
}
