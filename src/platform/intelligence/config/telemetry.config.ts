export type TelemetryBackend = "console" | "opentelemetry" | "noop";

export interface TelemetryConfig {
  readonly backend: TelemetryBackend;
  readonly metricsEnabled: boolean;
  readonly tracingEnabled: boolean;
  readonly logLevel: "debug" | "info" | "warn" | "error";
}

export function loadTelemetryConfig(): TelemetryConfig {
  const backend = (process.env.INTELLIGENCE_TELEMETRY_BACKEND ??
    "console") as TelemetryBackend;
  const logLevel = (process.env.INTELLIGENCE_LOG_LEVEL ?? "info") as TelemetryConfig["logLevel"];

  return {
    backend: ["console", "opentelemetry", "noop"].includes(backend)
      ? backend
      : "console",
    metricsEnabled:
      (process.env.INTELLIGENCE_METRICS_ENABLED ?? "true").toLowerCase() !==
      "false",
    tracingEnabled:
      (process.env.INTELLIGENCE_TRACING_ENABLED ?? "true").toLowerCase() !==
      "false",
    logLevel: ["debug", "info", "warn", "error"].includes(logLevel)
      ? logLevel
      : "info",
  };
}
