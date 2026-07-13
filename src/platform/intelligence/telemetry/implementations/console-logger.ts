import type { TelemetryConfig } from "../../config/telemetry.config";
import type { ILogger } from "../../shared/interfaces";

const LEVEL_ORDER = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export class ConsoleLogger implements ILogger {
  private readonly minLevel: number;

  constructor(config: Pick<TelemetryConfig, "logLevel">) {
    this.minLevel = LEVEL_ORDER[config.logLevel];
  }

  debug(message: string, context?: Readonly<Record<string, unknown>>): void {
    this.write("debug", message, context);
  }

  info(message: string, context?: Readonly<Record<string, unknown>>): void {
    this.write("info", message, context);
  }

  warn(message: string, context?: Readonly<Record<string, unknown>>): void {
    this.write("warn", message, context);
  }

  error(message: string, context?: Readonly<Record<string, unknown>>): void {
    this.write("error", message, context);
  }

  private write(
    level: keyof typeof LEVEL_ORDER,
    message: string,
    context?: Readonly<Record<string, unknown>>
  ): void {
    if (LEVEL_ORDER[level] < this.minLevel) {
      return;
    }
    const payload = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(context ?? {}),
    };
    // eslint-disable-next-line no-console
    console[level === "debug" ? "log" : level](JSON.stringify(payload));
  }
}
