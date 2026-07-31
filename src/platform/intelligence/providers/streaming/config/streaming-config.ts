/**
 * M9.5O streaming configuration.
 */

export interface StreamingRuntimeConfig {
  readonly enabled: boolean;
  readonly maxBufferBytes: number;
  readonly connectTimeoutMs: number;
  readonly firstOutputTimeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly maxDurationMs: number;
  readonly shutdownDrainMs: number;
}

export function loadStreamingRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): StreamingRuntimeConfig {
  const num = (k: string, d: number) => {
    const n = Number(env[k]);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    enabled: (env.STREAMING_ENABLED ?? "true").toLowerCase() !== "false",
    maxBufferBytes: Math.max(1024, Math.floor(num("STREAM_MAX_BUFFER_BYTES", 1_048_576))),
    connectTimeoutMs: Math.floor(num("STREAM_CONNECT_TIMEOUT_MS", 30_000)),
    firstOutputTimeoutMs: Math.floor(num("STREAM_FIRST_OUTPUT_TIMEOUT_MS", 30_000)),
    idleTimeoutMs: Math.floor(num("STREAM_IDLE_TIMEOUT_MS", 60_000)),
    maxDurationMs: Math.floor(num("STREAM_MAX_DURATION_MS", 600_000)),
    shutdownDrainMs: Math.floor(num("STREAM_SHUTDOWN_DRAIN_MS", 5_000)),
  };
}
