/**
 * Real-time notification push.
 * Watches the Notifications collection (Mongo change stream) so inserts from
 * ANY process — API, background workers, crons — reach the user's sockets
 * instantly as `notification:new`. Each API instance delivers only to its own
 * sockets (io.local) so a Redis adapter never causes duplicates.
 */

import Notifications from "../../models/notification.model";
import { getCollaborationIo } from "./socket-gateway";

type WatchStream = ReturnType<typeof Notifications.collection.watch>;
let stream: WatchStream | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let stopped = false;

function toPayload(doc: Record<string, any>): Record<string, unknown> {
  return {
    _id: String(doc._id),
    eventKey: doc.eventKey,
    title: doc.title,
    description: doc.description,
    type: doc.type,
    notificationType: doc.notificationType,
    userState: doc.userState,
    category: doc.category,
    isRead: Boolean(doc.isRead),
    action: doc.action,
    actionText: doc.actionText,
    secondaryAction: doc.secondaryAction,
    symbol: doc.symbol,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
  };
}

function scheduleRetry(): void {
  if (stopped || retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    startNotificationRealtime();
  }, 10_000);
}

export function startNotificationRealtime(): void {
  stopped = false;
  if (stream) return;
  let s: WatchStream;
  try {
    s = Notifications.collection.watch(
      [{ $match: { operationType: "insert" } }],
      { fullDocument: "default" }
    );
    stream = s;
  } catch (err) {
    console.warn(
      "[Notifications realtime] change stream unavailable:",
      err instanceof Error ? err.message : err
    );
    stream = undefined;
    scheduleRetry();
    return;
  }

  s.on("change", (change: any) => {
    const doc = change?.fullDocument;
    if (!doc?.userId || doc.archived) return;
    const io = getCollaborationIo();
    if (!io) return;
    io.local.to(`user:${String(doc.userId)}`).emit("notification:new", toPayload(doc));
  });

  s.on("error", (err) => {
    console.warn("[Notifications realtime] stream error:", err?.message ?? err);
    if (stream === s) stream = undefined;
    void s.close().catch(() => undefined);
    scheduleRetry();
  });

  s.on("close", () => {
    if (stream === s) {
      stream = undefined;
      scheduleRetry();
    }
  });

  console.log("[Notifications realtime] watching Notifications inserts");
}

export async function stopNotificationRealtime(): Promise<void> {
  stopped = true;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = undefined;
  const current = stream;
  stream = undefined;
  await current?.close().catch(() => undefined);
}
