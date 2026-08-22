/**
 * One-shot wipe of local/dev data so testing can start from scratch.
 * Drops MongoDB, flushes all Redis keys, deletes Firebase Auth users, and
 * purges legacy GetStream channels/users when configured.
 */
import { config } from "../src/config/dot.env";
config();

import mongoose from "mongoose";
import Redis from "ioredis";
import firebaseAdmin from "../src/libs/firebase";
import { redisConnectionFromEnv } from "../src/platform/infrastructure/durability/durable-mode";

function dbNameFromUri(uri: string): string {
  const withoutQuery = uri.split("?")[0];
  const parts = withoutQuery.split("/");
  return parts[parts.length - 1] || "(unknown)";
}

async function wipeMongo(): Promise<void> {
  const uri = process.env.DB_URI;
  if (!uri) throw new Error("DB_URI is not set");

  const dbName = dbNameFromUri(uri);
  console.log(`\n[mongo] connecting to database: ${dbName}`);
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  if (!db) throw new Error("Mongo connection has no db handle");

  const collections = await db.listCollections().toArray();
  console.log(`[mongo] collections before wipe: ${collections.length}`);
  for (const col of collections) {
    const count = await db.collection(col.name).estimatedDocumentCount();
    console.log(`  - ${col.name}: ~${count} docs`);
  }

  await mongoose.connection.dropDatabase();
  const after = await db.listCollections().toArray();
  console.log(`[mongo] dropped ${dbName}. collections after: ${after.length}`);
  await mongoose.disconnect();
}

async function wipeRedis(): Promise<void> {
  const config = redisConnectionFromEnv();
  if (!config) {
    console.log("\n[redis] skipped (REDIS_HOST / REDIES_HOST not set)");
    return;
  }

  console.log(
    `\n[redis] flushall on ${config.host}:${config.port}${config.tls ? " (TLS)" : ""}`,
  );
  const redis = new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    username: config.username,
    ...(config.tls ? { tls: { servername: config.host } } : {}),
    maxRetriesPerRequest: 3,
    connectTimeout: 10_000,
  });
  try {
    const before = await redis.dbsize();
    await redis.flushall();
    const after = await redis.dbsize();
    console.log(`[redis] flushed all DBs. keys before=${before} after=${after}`);
  } finally {
    redis.disconnect();
  }
}

async function wipeGetStream(): Promise<void> {
  const key = process.env.getstream_io_key;
  const secret = process.env.getstream_io_secret;
  if (!key || !secret) {
    console.log("\n[getstream] skipped (getstream_io_key / getstream_io_secret not set)");
    return;
  }

  console.log("\n[getstream] purging channels and users");
  try {
    // Config module may be gitignored locally; load at runtime only.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { streamServerClient } = require("../src/config/getStreamIo.config") as {
      streamServerClient: {
        queryChannels: (
          filter: Record<string, unknown>,
          sort: unknown[],
          opts: { limit: number; offset: number },
        ) => Promise<Array<{ cid?: string }>>;
        deleteChannels: (cids: string[], opts: { hard_delete: boolean }) => Promise<unknown>;
        queryUsers: (
          filter: Record<string, unknown>,
          sort: unknown[],
          opts: { limit: number; offset: number },
        ) => Promise<{ users: Array<{ id?: string }> }>;
        deleteUser: (id: string) => Promise<unknown>;
      };
    };

    let channelOffset = 0;
    let channelsDeleted = 0;
    for (;;) {
      const channels = await streamServerClient.queryChannels({}, [], {
        limit: 100,
        offset: channelOffset,
      });
      if (!channels.length) break;
      const cids = channels.map((c: { cid?: string }) => c.cid).filter(Boolean) as string[];
      if (cids.length) {
        await streamServerClient.deleteChannels(cids, { hard_delete: true });
        channelsDeleted += cids.length;
      }
      channelOffset += channels.length;
    }

    let userOffset = 0;
    let usersDeleted = 0;
    for (;;) {
      const page = await streamServerClient.queryUsers({}, [], {
        limit: 100,
        offset: userOffset,
      });
      if (!page.users.length) break;
      for (const user of page.users) {
        if (!user.id) continue;
        await streamServerClient.deleteUser(user.id);
        usersDeleted += 1;
      }
      userOffset += page.users.length;
    }

    console.log(
      `[getstream] deleted ${channelsDeleted} channels and ${usersDeleted} users`,
    );
  } catch (err) {
    console.warn("[getstream] wipe skipped or failed (non-fatal):", err);
  }
}

async function wipeFirebaseAuth(): Promise<void> {
  console.log("\n[firebase] deleting Auth users");
  let deleted = 0;
  let nextPageToken: string | undefined;
  do {
    const page = await firebaseAdmin.auth().listUsers(1000, nextPageToken);
    if (page.users.length === 0) break;
    const uids = page.users.map((u) => u.uid);
    const result = await firebaseAdmin.auth().deleteUsers(uids);
    deleted += result.successCount;
    if (result.failureCount) {
      console.warn(`[firebase] ${result.failureCount} delete failures`);
    }
    nextPageToken = page.pageToken;
  } while (nextPageToken);
  console.log(`[firebase] deleted ${deleted} Auth users`);
}

async function main() {
  console.log("Wiping Unagency data for a clean test start...");
  await wipeMongo();
  await wipeRedis();
  await wipeGetStream();
  await wipeFirebaseAuth();
  console.log(
    "\nDone. Server data wiped. Sign out of the mobile app (or reinstall) to clear local chat cache.",
  );
}

main()
  .catch((err) => {
    console.error("\nWipe failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
    process.exit();
  });
