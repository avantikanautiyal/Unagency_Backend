/**
 * M9.4 — Durable runtime configuration.
 */

export function isDurableRuntimeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ENTERPRISE_API_DURABLE_MODE === "true";
}

export function requireDurableRuntimeForLive(
  executionMode: string,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (executionMode === "live" && env.NODE_ENV === "production" && !isDurableRuntimeEnabled(env)) {
    throw new Error(
      "NODE_ENV=production with ENTERPRISE_API_EXECUTION_MODE=live requires ENTERPRISE_API_DURABLE_MODE=true"
    );
  }
}

export function redisConnectionFromEnv(env: NodeJS.ProcessEnv = process.env): {
  host: string;
  port: number;
  password?: string;
} | undefined {
  const host = env.REDIS_HOST ?? env.REDIES_HOST;
  const portRaw = env.REDIS_PORT ?? env.REDIES_PORT;
  if (!host || !portRaw) return undefined;
  const port = Number(portRaw);
  if (!Number.isFinite(port)) return undefined;
  return {
    host,
    port,
    password: env.REDIS_PASSWORD ?? env.REDIES_PASSWORD,
  };
}

export function durableRuntimeRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return isDurableRuntimeEnabled(env);
}
