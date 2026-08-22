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
  const key = `${config.host}:${config.port}:${config.tls ? "tls" : "plain"}`;
  if (sharedClient && sharedClientKey === key) return sharedClient;
  sharedClient = new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    username: config.username,
    ...(config.tls
      ? { tls: { servername: config.host } }
      : {}),
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableOfflineQueue: false,
  });
  sharedClient.on("error", (err) => {
    console.warn("[redis] client error:", err.message);
  });
  sharedClientKey = key;
  return sharedClient;
}

export async function pingSharedRedis(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const client = getSharedRedisClient(env);
  if (!client) return false;
  try {
    await ensureRedisClientReady(client);
    const pong = await client.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

export async function ensureRedisClientReady(client: Redis): Promise<void> {
  if (client.status === "ready") return;
  if (client.status === "wait" || client.status === "end" || client.status === "close") {
    await client.connect();
    return;
  }
  if (client.status === "connecting" || client.status === "reconnecting") {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("redis connect timeout")), 5_000);
      const onReady = () => {
        clearTimeout(timer);
        client.off("error", onError);
        resolve();
      };
      const onError = (err: Error) => {
        clearTimeout(timer);
        client.off("ready", onReady);
        reject(err);
      };
      client.once("ready", onReady);
      client.once("error", onError);
    });
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
