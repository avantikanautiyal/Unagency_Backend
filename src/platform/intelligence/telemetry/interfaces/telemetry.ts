/**
 * Telemetry foundation ports.
 * M0 uses console adapter; later replaced by OpenTelemetry.
 */

import type { ILogger } from "../../shared/interfaces";
import type {
  ExecutionMetrics,
  MetricTags,
} from "../contracts/metrics";

export interface IMetrics {
  increment(name: string, tags?: MetricTags, value?: number): void;
  gauge(name: string, value: number, tags?: MetricTags): void;
  timing(name: string, durationMs: number, tags?: MetricTags): void;
}

export interface ITraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
}

export interface ISpan {
  readonly context: ITraceContext;
  setAttribute(key: string, value: unknown): void;
  recordError(error: unknown): void;
  end(): void;
}

export interface ITracer {
  startSpan(name: string, parent?: ITraceContext): ISpan;
}

export interface ITelemetry {
  readonly metrics: IMetrics;
  readonly tracer: ITracer;
  readonly logger: ILogger;
  recordExecution(metrics: ExecutionMetrics): void;
}
