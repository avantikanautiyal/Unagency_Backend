export interface IntelligenceConfig {
  readonly defaultTimeoutMs: number;
  readonly maxConcurrentExecutions: number;
  readonly playgroundEnabled: boolean;
}

export function loadIntelligenceConfig(): IntelligenceConfig {
  return {
    defaultTimeoutMs: Number(process.env.INTELLIGENCE_DEFAULT_TIMEOUT_MS ?? 60_000),
    maxConcurrentExecutions: Number(
      process.env.INTELLIGENCE_MAX_CONCURRENT_EXECUTIONS ?? 10
    ),
    playgroundEnabled:
      (process.env.INTELLIGENCE_PLAYGROUND_ENABLED ?? "false").toLowerCase() ===
      "true",
  };
}
