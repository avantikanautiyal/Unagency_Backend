/**
 * M10.19 — Collaboration OS unit tests (first-party, no GetStream).
 */

import mongoose from "mongoose";
import {
  buildRoomKey,
} from "../../../src/platform/collaboration/models";
import { mapLegacyRoleToCollaborationRole } from "../../../src/services/collaboration/collaboration-types";

jest.mock("../../../src/models/notification.model", () => ({
  __esModule: true,
  default: { create: jest.fn(async () => ({})) },
}));

describe("M10.19 Collaboration OS types", () => {
  it("builds stable entity-scoped room keys (never public)", () => {
    expect(buildRoomKey("project", "507f1f77bcf86cd799439011")).toMatch(
      /^project_/
    );
    expect(buildRoomKey("brand", "abc-123")).toBe("brand_abc-123");
    expect(buildRoomKey("brief", "x".repeat(100)).length).toBeLessThanOrEqual(64);
    expect(buildRoomKey("organization", "org1")).not.toMatch(/^public/);
  });

  it("maps legacy RBAC into collaboration roles", () => {
    expect(mapLegacyRoleToCollaborationRole("admin")).toBe("admin");
    expect(mapLegacyRoleToCollaborationRole("servicing")).toBe("manager");
    expect(mapLegacyRoleToCollaborationRole("customer")).toBe("client");
    expect(mapLegacyRoleToCollaborationRole("approver")).toBe("approver");
  });
});

describe("M10.19 Collaboration OS service", () => {
  const store = {
    conversations: new Map<string, any>(),
    members: [] as any[],
    messages: [] as any[],
  };

  beforeEach(() => {
    store.conversations.clear();
    store.members = [];
    store.messages = [];
    jest.resetModules();

    jest.doMock("../../../src/platform/collaboration/models", () => {
      const actual = jest.requireActual(
        "../../../src/platform/collaboration/models"
      );
      return {
        ...actual,
        Conversation: {
          findOne: jest.fn(async (q: any) => {
            if (q.roomKey) return store.conversations.get(q.roomKey) || null;
            return null;
          }),
          findById: jest.fn(async (id: string) => {
            for (const c of store.conversations.values()) {
              if (c._id.toString() === String(id)) return c;
            }
            return null;
          }),
          find: jest.fn(async () => [...store.conversations.values()]),
          create: jest.fn(async (doc: any) => {
            const saved = {
              ...doc,
              _id: new mongoose.Types.ObjectId(),
              save: jest.fn(async function (this: any) {
                return this;
              }),
            };
            store.conversations.set(doc.roomKey, saved);
            return saved;
          }),
        },
        ConversationMember: {
          findOne: jest.fn(async (q: any) => {
            return (
              store.members.find(
                (m) =>
                  m.conversationId.toString() ===
                    q.conversationId?.toString() &&
                  m.userId.toString() === q.userId?.toString()
              ) || null
            );
          }),
          findOneAndUpdate: jest.fn(async (q: any, update: any) => {
            const existing = store.members.find(
              (m) =>
                m.conversationId.toString() === q.conversationId?.toString() &&
                m.userId.toString() === q.userId?.toString()
            );
            if (existing) return existing;
            const created = {
              ...(update.$setOnInsert || {}),
              conversationId: q.conversationId,
              userId: q.userId,
              unreadCount: 0,
              save: jest.fn(async function (this: any) {
                return this;
              }),
            };
            store.members.push(created);
            return created;
          }),
          find: jest.fn(async (q: any) => {
            return store.members.filter(
              (m) =>
                !q.userId || m.userId.toString() === q.userId.toString()
            );
          }),
          updateMany: jest.fn(async () => ({})),
          deleteMany: jest.fn(async () => ({})),
        },
        CollabMessage: {
          findOne: jest.fn((q: any) => {
            const resolve = async () => {
              if (q.clientMessageId) {
                return (
                  store.messages.find(
                    (m) => m.clientMessageId === q.clientMessageId
                  ) || null
                );
              }
              if (q.conversationId && !q._id) {
                const rows = store.messages.filter(
                  (m) =>
                    m.conversationId.toString() === q.conversationId.toString()
                );
                return rows.sort((a, b) => b.sequence - a.sequence)[0] || null;
              }
              return (
                store.messages.find(
                  (m) => m._id.toString() === String(q._id || "")
                ) || null
              );
            };
            const promise = resolve();
            (promise as any).sort = () => ({
              select: () => promise,
            });
            return promise;
          }),
          find: jest.fn((q: any) => {
            const rows = Promise.resolve(
              store.messages
                .filter(
                  (m) =>
                    m.conversationId.toString() ===
                    q.conversationId?.toString()
                )
                .sort((a, b) => a.sequence - b.sequence)
            );
            const chain: any = rows;
            chain.sort = () => chain;
            chain.limit = () => rows;
            return chain;
          }),
          create: jest.fn(async (doc: any) => {
            const saved = {
              ...doc,
              _id: new mongoose.Types.ObjectId(),
              createdAt: new Date(),
            };
            store.messages.push(saved);
            return saved;
          }),
        },
        MessageAttachment: { create: jest.fn(async () => ({})) },
        Thread: { findOneAndUpdate: jest.fn(async () => ({})) },
        Mention: { create: jest.fn(async () => ({})) },
        ReadReceipt: { findOneAndUpdate: jest.fn(async () => ({})) },
        ConversationAudit: { create: jest.fn(async () => ({})) },
      };
    });
  });

  it("provisions idempotent project rooms and enforces membership", async () => {
    const { collaborationOsService } = await import(
      "../../../src/platform/collaboration/collaboration-os-service"
    );
    const org = new mongoose.Types.ObjectId().toString();
    const owner = new mongoose.Types.ObjectId().toString();
    const projectId = new mongoose.Types.ObjectId().toString();

    const a = await collaborationOsService.provisionForProject({
      projectId,
      name: "Launch",
      organizationId: org,
      memberUserIds: [owner],
      createdByUserId: owner,
    });
    const b = await collaborationOsService.provisionForProject({
      projectId,
      name: "Launch",
      organizationId: org,
      memberUserIds: [owner],
      createdByUserId: owner,
    });
    expect(a.channelId).toBe(b.channelId);
    expect(b.created).toBe(false);

    await expect(
      collaborationOsService.assertMembership(
        new mongoose.Types.ObjectId().toString(),
        a.channelId
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("sends ordered messages with client idempotency", async () => {
    const { collaborationOsService } = await import(
      "../../../src/platform/collaboration/collaboration-os-service"
    );
    const org = new mongoose.Types.ObjectId().toString();
    const owner = new mongoose.Types.ObjectId().toString();
    const projectId = new mongoose.Types.ObjectId().toString();
    const { channelId } = await collaborationOsService.provisionForProject({
      projectId,
      name: "Launch",
      organizationId: org,
      memberUserIds: [owner],
      createdByUserId: owner,
    });

    const m1 = await collaborationOsService.sendMessage({
      userId: owner,
      channelId,
      text: "hello",
      clientMessageId: "c1",
    });
    const m2 = await collaborationOsService.sendMessage({
      userId: owner,
      channelId,
      text: "hello",
      clientMessageId: "c1",
    });
    expect(m1.id).toBe(m2.id);
    expect(m1.sequence).toBe(1);

    const listed = await collaborationOsService.listMessages({
      userId: owner,
      channelId,
    });
    expect(listed).toHaveLength(1);
  });

  it("channel facade reports configured without GetStream env", async () => {
    delete process.env.getstream_io_key;
    delete process.env.getstream_io_secret;
    const { collaborationChannelService } = await import(
      "../../../src/services/collaboration/collaboration-channel-service"
    );
    expect(collaborationChannelService.isConfigured()).toBe(true);
    const token = await collaborationChannelService.issueToken({
      userId: "u1",
      userRole: "customer",
    });
    expect(token.transport).toBe("unagency-socket");
    expect(token.apiKey).toBe("unagency-collaboration-os");
  });
});

describe("M10.19 socket rate limit helper semantics", () => {
  it("exports gateway module without GetStream imports", async () => {
    const fs = await import("fs");
    const path = require("path") as typeof import("path");
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/collaboration/socket-gateway.ts"
      ),
      "utf8"
    );
    expect(src).toMatch(/socket\.io/);
    expect(src).not.toMatch(/stream-chat|getStream|GetStream/);
    expect(src).toMatch(/verifyFirebaseIdToken/);
  });
});
