/**
 * Shared Redis client for durable coordination (idempotency, rate limits, usage).
 */

import Redis from "ioredis";
import { redisConnectionFromEnv } from "../durable-mode";

let sharedClient: Redis | undefined;
let sharedClientKey: string | undefined;

export function getSharedRedisClient(env: NodeJS.ProcessEnv = process.env): Redis | undefined {
  const config = redisConnectionFromEnv(env);
  if (!config) return undefined;
  const key = `${config.host}:${config.port}`;
  if (sharedClient && sharedClientKey === key) return sharedClient;
  sharedClient = new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableOfflineQueue: false,
  });
  sharedClientKey = key;
  return sharedClient;
}

export async function pingSharedRedis(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const client = getSharedRedisClient(env);
  if (!client) return false;
  try {
    if (client.status === "wait" || client.status === "end") {
      await client.connect();
    }
    const pong = await client.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

export async function closeSharedRedisClient(): Promise<void> {
  if (sharedClient) {
    try {
      await sharedClient.quit();
    } catch {
      sharedClient.disconnect();
    }
    sharedClient = undefined;
    sharedClientKey = undefined;
  }
}

export function resetSharedRedisClientForTests(): void {
  if (sharedClient) {
    try {
      sharedClient.disconnect();
    } catch {
      /* ignore */
    }
  }
  sharedClient = undefined;
  sharedClientKey = undefined;
}
