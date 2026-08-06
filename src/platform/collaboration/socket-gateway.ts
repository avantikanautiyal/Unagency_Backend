/**
 * M10.19 Collaboration OS — Socket.IO gateway (first-party realtime).
 * Auth: Firebase ID token → Mongo user → org/permissions → socket session.
 * Scaling: optional Redis adapter via shared ioredis client.
 */

import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { verifyFirebaseIdToken } from "../../libs/firebase/verify-id-token";
import Users from "../../models/users.model";
import { getSharedRedisClient } from "../infrastructure/durability/redis/redis-client-factory";
import { redisConnectionFromEnv } from "../infrastructure/durability/durable-mode";
import { collaborationOsService } from "./collaboration-os-service";
import type { PresenceStatus } from "./models";

export type SocketSession = {
  userId: string;
  firebaseUid: string;
  organizationId?: string;
  userRole?: string;
};

const presenceByUser = new Map<string, PresenceStatus>();
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

let ioSingleton: Server | undefined;

function rateLimit(key: string, limit = 30, windowMs = 10_000): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

async function authenticateSocket(socket: Socket): Promise<SocketSession> {
  const token =
    (socket.handshake.auth?.token as string | undefined) ||
    (socket.handshake.headers?.authorization?.toString().replace(/^Bearer\s+/i, "") ??
      "");
  if (!token) throw new Error("Missing auth token");

  const identity = await verifyFirebaseIdToken(token);
  const user = await Users.findOne({ firebaseId: identity.uid });
  if (!user) throw new Error("User not registered");

  const organizationId =
    (user as any).organization?._id?.toString?.() ||
    (user as any).organizationId?.toString?.() ||
    undefined;

  return {
    userId: user._id.toString(),
    firebaseUid: identity.uid,
    organizationId,
    userRole: (user as any).userRole,
  };
}

export function getCollaborationIo(): Server | undefined {
  return ioSingleton;
}

export async function attachCollaborationSocketGateway(
  httpServer: HttpServer
): Promise<Server> {
  if (ioSingleton) return ioSingleton;

  const io = new Server(httpServer, {
    path: "/collaboration/socket.io",
    cors: { origin: true, credentials: true },
    transports: ["websocket", "polling"],
    pingInterval: 20_000,
    pingTimeout: 25_000,
  });

  // Redis adapter for horizontal scaling (optional — falls back to in-process)
  try {
    const cfg = redisConnectionFromEnv(process.env);
    if (cfg) {
      const pub = new Redis({
        host: cfg.host,
        port: cfg.port,
        password: cfg.password,
        lazyConnect: true,
        maxRetriesPerRequest: null,
      });
      const sub = pub.duplicate();
      await Promise.all([pub.connect(), sub.connect()]);
      io.adapter(createAdapter(pub, sub));
      console.log("[Collaboration OS] Socket.IO Redis adapter attached");
    } else {
      // Prefer shared client presence when REDIS_* unset — single instance OK
      const shared = getSharedRedisClient();
      if (shared) {
        console.log(
          "[Collaboration OS] Redis configured but adapter skipped (use REDIS_HOST for multi-instance)"
        );
      } else {
        console.log(
          "[Collaboration OS] Socket.IO in-process mode (set REDIS_HOST for scale-out)"
        );
      }
    }
  } catch (err) {
    console.warn(
      "[Collaboration OS] Redis adapter unavailable:",
      err instanceof Error ? err.message : err
    );
  }

  io.use(async (socket, next) => {
    try {
      const session = await authenticateSocket(socket);
      (socket.data as { session?: SocketSession }).session = session;
      next();
    } catch (err) {
      next(new Error(err instanceof Error ? err.message : "Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const session = (socket.data as { session: SocketSession }).session;
    const userRoom = `user:${session.userId}`;
    void socket.join(userRoom);
    presenceByUser.set(session.userId, "online");
    io.to(userRoom).emit("presence:update", {
      userId: session.userId,
      status: "online",
    });

    socket.emit("session:ready", {
      userId: session.userId,
      organizationId: session.organizationId,
      transport: "unagency-collaboration-os",
    });

    socket.on("conversation:join", async (payload, ack) => {
      try {
        const channelId = String(payload?.channelId || "");
        if (!rateLimit(`join:${session.userId}`)) {
          throw new Error("Rate limited");
        }
        const { conversation } = await collaborationOsService.assertMembership(
          session.userId,
          channelId
        );
        const room = `conversation:${conversation.roomKey}`;
        await socket.join(room);
        if (typeof ack === "function") {
          ack({ ok: true, channelId: conversation.roomKey });
        }
        socket.to(room).emit("presence:update", {
          userId: session.userId,
          status: "online",
          channelId: conversation.roomKey,
        });
      } catch (err) {
        if (typeof ack === "function") {
          ack({
            ok: false,
            error: err instanceof Error ? err.message : "join failed",
          });
        }
      }
    });

    socket.on("conversation:leave", async (payload) => {
      const channelId = String(payload?.channelId || "");
      await socket.leave(`conversation:${channelId}`);
    });

    socket.on("typing:start", (payload) => {
      const channelId = String(payload?.channelId || "");
      if (!channelId) return;
      if (!rateLimit(`typing:${session.userId}`, 20, 5_000)) return;
      presenceByUser.set(session.userId, "typing");
      socket.to(`conversation:${channelId}`).emit("typing:update", {
        userId: session.userId,
        channelId,
        typing: true,
      });
      const key = `${session.userId}:${channelId}`;
      const prev = typingTimers.get(key);
      if (prev) clearTimeout(prev);
      typingTimers.set(
        key,
        setTimeout(() => {
          socket.to(`conversation:${channelId}`).emit("typing:update", {
            userId: session.userId,
            channelId,
            typing: false,
          });
          if (presenceByUser.get(session.userId) === "typing") {
            presenceByUser.set(session.userId, "online");
          }
        }, 3000)
      );
    });

    socket.on("typing:stop", (payload) => {
      const channelId = String(payload?.channelId || "");
      socket.to(`conversation:${channelId}`).emit("typing:update", {
        userId: session.userId,
        channelId,
        typing: false,
      });
      presenceByUser.set(session.userId, "online");
    });

    socket.on("presence:set", (payload) => {
      const status = String(payload?.status || "online") as PresenceStatus;
      presenceByUser.set(session.userId, status);
      const channelId = payload?.channelId
        ? String(payload.channelId)
        : undefined;
      const target = channelId
        ? `conversation:${channelId}`
        : `user:${session.userId}`;
      socket.to(target).emit("presence:update", {
        userId: session.userId,
        status,
        channelId,
      });
    });

    socket.on("message:send", async (payload, ack) => {
      try {
        if (!rateLimit(`msg:${session.userId}`, 40, 10_000)) {
          throw new Error("Rate limited");
        }
        const channelId = String(payload?.channelId || "");
        const text = String(payload?.text || "").trim();
        if (!text) throw new Error("text required");
        const message = await collaborationOsService.sendMessage({
          userId: session.userId,
          channelId,
          text,
          messageType: payload?.messageType,
          parentId: payload?.parentId,
          threadKind: payload?.threadKind,
          clientMessageId: payload?.clientMessageId,
          assetId: payload?.assetId,
          artifactId: payload?.artifactId,
          executionId: payload?.executionId,
          approvalId: payload?.approvalId,
          metadata: payload?.metadata,
        });
        const room = `conversation:${message.channelId}`;
        io.to(room).emit("message:new", message);
        if (typeof ack === "function") ack({ ok: true, message });
      } catch (err) {
        if (typeof ack === "function") {
          ack({
            ok: false,
            error: err instanceof Error ? err.message : "send failed",
          });
        }
      }
    });

    socket.on("message:ack", async (payload) => {
      try {
        const channelId = String(payload?.channelId || "");
        const messageId = String(payload?.messageId || "");
        const status = String(payload?.status || "delivered");
        if (status === "read") {
          await collaborationOsService.markRead({
            userId: session.userId,
            channelId,
            messageId,
          });
          io.to(`conversation:${channelId}`).emit("receipt:update", {
            channelId,
            messageId,
            userId: session.userId,
            status: "read",
          });
        } else {
          await collaborationOsService.markDelivered({
            userId: session.userId,
            channelId,
            messageId,
          });
          io.to(`conversation:${channelId}`).emit("receipt:update", {
            channelId,
            messageId,
            userId: session.userId,
            status: "delivered",
          });
        }
      } catch {
        /* ignore */
      }
    });

    socket.on("disconnect", () => {
      presenceByUser.set(session.userId, "offline");
      io.emit("presence:update", {
        userId: session.userId,
        status: "offline",
      });
    });
  });

  ioSingleton = io;
  return io;
}

/** Broadcast helpers for execution / AI / approvals (reuse from other services). */
export function emitCollaborationEvent(
  channelId: string,
  event: string,
  payload: Record<string, unknown>
): void {
  if (!ioSingleton) return;
  ioSingleton.to(`conversation:${channelId}`).emit(event, payload);
}

export function emitToUser(
  userId: string,
  event: string,
  payload: Record<string, unknown>
): void {
  if (!ioSingleton) return;
  ioSingleton.to(`user:${userId}`).emit(event, payload);
}

export async function shutdownCollaborationSocketGateway(): Promise<void> {
  if (!ioSingleton) return;
  await new Promise<void>((resolve) => {
    ioSingleton!.close(() => resolve());
  });
  ioSingleton = undefined;
}
