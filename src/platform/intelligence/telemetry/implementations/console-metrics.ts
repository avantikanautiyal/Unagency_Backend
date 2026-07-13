import type { ILogger } from "../../shared/interfaces";
import type { MetricTags } from "../contracts/metrics";
import type { IMetrics } from "../interfaces/telemetry";

export class ConsoleMetrics implements IMetrics {
  constructor(
    private readonly logger: ILogger,
    private readonly enabled: boolean
  ) {}

  increment(name: string, tags?: MetricTags, value = 1): void {
    if (!this.enabled) return;
    this.logger.debug("metric.increment", { name, value, tags });
  }

  gauge(name: string, value: number, tags?: MetricTags): void {
    if (!this.enabled) return;
    this.logger.debug("metric.gauge", { name, value, tags });
  }

  timing(name: string, durationMs: number, tags?: MetricTags): void {
    if (!this.enabled) return;
    this.logger.debug("metric.timing", { name, durationMs, tags });
  }
}
