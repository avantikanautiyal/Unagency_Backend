import type { TelemetryConfig } from "../../config/telemetry.config";
import type { ILogger } from "../../shared/interfaces";
import type { ExecutionMetrics } from "../contracts/metrics";
import type { IMetrics, ITelemetry, ITracer } from "../interfaces/telemetry";
import { ConsoleLogger } from "./console-logger";
import { ConsoleMetrics } from "./console-metrics";
import { ConsoleTracer } from "./console-tracer";

/**
 * Console-backed telemetry adapter for Milestone M0.
 * Replaceable with OpenTelemetry in later milestones.
 */
export class ConsoleTelemetry implements ITelemetry {
  readonly metrics: IMetrics;
  readonly tracer: ITracer;
  readonly logger: ILogger;

  constructor(config: TelemetryConfig) {
    this.logger = new ConsoleLogger(config);
    this.metrics = new ConsoleMetrics(this.logger, config.metricsEnabled);
    this.tracer = new ConsoleTracer(this.logger, config.tracingEnabled);
  }

  recordExecution(metrics: ExecutionMetrics): void {
    this.metrics.timing("intelligence.execution.latency", metrics.latencyMs ?? 0, {
      capabilityId: metrics.capabilityId ?? "unknown",
      status: metrics.status ?? "unknown",
    });

    if (metrics.tokens) {
      this.metrics.gauge("intelligence.execution.tokens", metrics.tokens.totalTokens, {
        capabilityId: metrics.capabilityId ?? "unknown",
      });
    }

    if (metrics.cost) {
      this.metrics.gauge("intelligence.execution.cost", metrics.cost.amount, {
        capabilityId: metrics.capabilityId ?? "unknown",
      });
    }

    this.logger.info("intelligence.execution.metrics", { ...metrics });
  }
}
