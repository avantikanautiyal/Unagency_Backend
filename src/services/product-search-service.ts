/**
 * Global product search (M10.12, expanded M10.17) — real Mongo queries only.
 * No mock/demo/hardcoded hits — every result is a real tenant-scoped record.
 */

import mongoose from "mongoose";
import Projects from "../models/projects.model";
import Brands from "../models/brand.model";
import MediaFile from "../models/mediaFile.model";
import Requirement from "../models/requestProject.model";
import Teams from "../models/team.model";
import Users from "../models/users.model";
import Notifications from "../models/notification.model";
import SavedRoutes from "../models/savedRoute.model";
import Categories from "../models/categories.model";
import HelpArticles from "../models/helpArticle.model";
import SearchRecent from "../models/searchRecent.model";
import SearchAudit from "../models/searchAudit.model";
import { resolveCustomerOrganizationId } from "./product-asset-service";
import { searchKnowledgeChunks } from "./knowledge-document-index-service";
import ChatRoom from "../models/chatRoom.model";
import { Conversation } from "../platform/collaboration/models";
import { CollabMessage } from "../platform/collaboration/models";
import { ConversationMember } from "../platform/collaboration/models";

export type SearchHitKind =
  | "project"
  | "brand"
  | "asset"
  | "brief"
  | "member"
  | "notification"
  | "execution"
  | "route"
  | "category"
  | "help"
  | "document"
  | "conversation"
  | "approval";

export type SearchHit = {
  kind: SearchHitKind;
  id: string;
  title: string;
  subtitle?: string;
  score: number;
};

export type SearchResultDto = {
  query: string;
  hits: SearchHit[];
  page: number;
  limit: number;
  hasMore: boolean;
};

export type SearchQueryInput = {
  userId: string;
  organizationId?: string;
  brandId?: string;
  q: string;
  types?: SearchHitKind[];
  page?: number;
  limit?: number;
  cursor?: string;
  /** When true, persist the query to recent searches (explicit submit only). */
  recordRecent?: boolean;
};

const ALL_KINDS: readonly SearchHitKind[] = [
  "project",
  "brand",
  "asset",
  "brief",
  "member",
  "notification",
  "execution",
  "route",
  "category",
  "help",
  "document",
  "conversation",
  "approval",
];

function scoreMatch(q: string, title: string, subtitle?: string): number {
  const t = (title || "").toLowerCase();
  const qq = q.toLowerCase();
  if (!t) return subtitle?.toLowerCase().includes(qq) ? 15 : 5;
  if (t === qq) return 100;
  if (t.startsWith(qq)) return 80;
  if (t.includes(qq)) return 50;
  if (subtitle && subtitle.toLowerCase().includes(qq)) return 20;
  return 10;
}

function wantsKind(types: SearchHitKind[] | undefined, kind: SearchHitKind): boolean {
  return !types || types.length === 0 || types.includes(kind);
}

function parseBrandLabelFromDescription(description?: string): string | undefined {
  if (!description) return undefined;
  const match = String(description).match(/Brand:\s*([^.\n]+)/i);
  const name = match?.[1]?.trim();
  return name ? `Brand: ${name}` : undefined;
}

function projectServiceSubtitle(serviceTitle: string): string {
  return serviceTitle
    .split("·")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean)
    .join(" · ");
}

function projectSearchDisplay(input: {
  serviceTitle: string;
  description?: string;
  brandName?: string;
}): { title: string; subtitle?: string } {
  const serviceTitle = String(input.serviceTitle ?? "").trim();
  const brandLabel = input.brandName
    ? `Brand: ${input.brandName.trim()}`
    : parseBrandLabelFromDescription(input.description);

  if (brandLabel) {
    return {
      title: brandLabel,
      subtitle: serviceTitle ? projectServiceSubtitle(serviceTitle) : undefined,
    };
  }

  return {
    title: serviceTitle,
    subtitle: input.description?.slice(0, 80),
  };
}

export class ProductSearchService {
  async search(input: SearchQueryInput): Promise<SearchResultDto> {
    const start = Date.now();
    const q = String(input.q ?? "").trim();
    const page = Math.max(1, Number(input.page) || Number(input.cursor) || 1);
    const limit = Math.min(Math.max(1, Number(input.limit) || 20), 50);
    if (!q) {
      return { query: "", hits: [], page, limit, hasMore: false };
    }

    let organizationId: string;
    try {
      organizationId = await resolveCustomerOrganizationId(
        input.userId,
        input.organizationId
      );
    } catch {
      return { query: q, hits: [], page, limit, hasMore: false };
    }

    const hits = await this.collectHits({
      organizationId,
      userId: input.userId,
      brandId: input.brandId,
      q,
      types: input.types,
    });

    hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

    const offset = (page - 1) * limit;
    const page_ = hits.slice(offset, offset + limit);
    const hasMore = offset + limit < hits.length;

    void this.audit({
      userId: input.userId,
      organizationId,
      brandId: input.brandId,
      query: q,
      latencyMs: Date.now() - start,
      resultCount: hits.length,
    }).catch(() => undefined);

    if (input.recordRecent) {
      void this.recordRecent({
        userId: input.userId,
        organizationId,
        query: q,
      }).catch(() => undefined);
    }

    return { query: q, hits: page_, page, limit, hasMore };
  }

  private async collectHits(input: {
    organizationId: string;
    userId: string;
    brandId?: string;
    q: string;
    types?: SearchHitKind[];
  }): Promise<SearchHit[]> {
    const { organizationId, userId, q, types, brandId } = input;
    const orgOid = new mongoose.Types.ObjectId(organizationId);
    const userOid = mongoose.isValidObjectId(userId)
      ? new mongoose.Types.ObjectId(userId)
      : undefined;
    const rx = { $regex: q, $options: "i" };
    const perKindLimit = 30;
    const hits: SearchHit[] = [];

    const tasks: Promise<void>[] = [];

    if (wantsKind(types, "project")) {
      tasks.push(
        (async () => {
          const rows = await Projects.find({
            orgId: orgOid,
            $or: [{ title: rx }, { description: rx }],
          })
            .limit(perKindLimit)
            .select("title description brandId")
            .lean();

          const brandIds = [
            ...new Set(
              rows
                .map((p) => p.brandId?.toString())
                .filter(
                  (id): id is string => Boolean(id && mongoose.isValidObjectId(id))
                )
            ),
          ];
          const brandNames = new Map<string, string>();
          if (brandIds.length) {
            const brands = await Brands.find({ _id: { $in: brandIds } })
              .select("name")
              .lean();
            for (const b of brands as Array<{ _id: mongoose.Types.ObjectId; name?: string }>) {
              const name = String(b.name ?? "").trim();
              if (name) brandNames.set(b._id.toString(), name);
            }
          }

          for (const p of rows) {
            const serviceTitle = String(p.title ?? "");
            const brandId = p.brandId?.toString();
            const display = projectSearchDisplay({
              serviceTitle,
              description: p.description,
              brandName: brandId ? brandNames.get(brandId) : undefined,
            });
            hits.push({
              kind: "project",
              id: p._id.toString(),
              title: display.title,
              subtitle: display.subtitle,
              score: scoreMatch(q, serviceTitle, p.description),
            });
          }
        })().catch(() => undefined)
      );
    }

    if (wantsKind(types, "brand")) {
      const brandFilter: Record<string, unknown> = {
        organizationId: orgOid,
        status: "active",
        $or: [
          { name: rx },
          { industry: rx },
          { voice: rx },
          { positioning: rx },
          { "guidelinesProfile.mission": rx },
          { "guidelinesProfile.vision": rx },
          { "guidelinesProfile.description": rx },
          { "guidelinesProfile.brandStory": rx },
        ],
      };
      if (brandId) brandFilter._id = brandId;
      tasks.push(
        Brands.find(brandFilter)
          .limit(perKindLimit)
          .select("name industry")
          .then((rows) => {
            for (const b of rows) {
              hits.push({
                kind: "brand",
                id: b._id.toString(),
                title: b.name,
                subtitle: b.industry || undefined,
                score: scoreMatch(q, b.name, b.industry),
              });
            }
          })
          .catch(() => undefined)
      );
    }

    if (wantsKind(types, "asset")) {
      const assetFilter: Record<string, unknown> = {
        organizationId: orgOid,
        status: { $ne: "deleted" },
        fileName: rx,
      };
      if (brandId) assetFilter.brandId = brandId;
      tasks.push(
        MediaFile.find(assetFilter)
          .limit(perKindLimit)
          .select("fileName kind")
          .then((rows) => {
            for (const a of rows) {
              hits.push({
                kind: "asset",
                id: a._id.toString(),
                title: a.fileName || "asset",
                subtitle: a.kind,
                score: scoreMatch(q, a.fileName || ""),
              });
            }
          })
          .catch(() => undefined)
      );
    }

    if (wantsKind(types, "brief")) {
      tasks.push(
        Requirement.find({
          userId: userOid,
          $or: [{ title: rx }, { description: rx }],
        })
          .limit(perKindLimit)
          .select("title status")
          .then((rows) => {
            for (const b of rows) {
              hits.push({
                kind: "brief",
                id: b._id.toString(),
                title: b.title,
                subtitle: b.status,
                score: scoreMatch(q, b.title),
              });
            }
          })
          .catch(() => undefined)
      );
    }

    if (wantsKind(types, "member")) {
      tasks.push(
        (async () => {
          const teams = await Teams.find({
            Organization: orgOid,
            invitationStatus: "accepted",
          })
            .limit(50)
            .select("userId role");
          const memberIds = teams.map((t) => t.userId);
          if (!memberIds.length) return;
          const members = await Users.find({ _id: { $in: memberIds } })
            .select("name email")
            .lean();
          for (const u of members as any[]) {
            const hay = `${u.name ?? ""} ${u.email ?? ""}`.toLowerCase();
            if (!hay.includes(q.toLowerCase())) continue;
            hits.push({
              kind: "member",
              id: String(u._id),
              title: String(u.name || u.email || u._id),
              subtitle: u.email ? String(u.email) : undefined,
              score: scoreMatch(q, String(u.name || ""), u.email),
            });
          }
        })().catch(() => undefined)
      );
    }

    if (wantsKind(types, "notification")) {
      tasks.push(
        Notifications.find({
          userId,
          $or: [{ title: rx }, { description: rx }],
        })
          .limit(perKindLimit)
          .select("title description")
          .then((rows) => {
            for (const n of rows as any[]) {
              hits.push({
                kind: "notification",
                id: n._id.toString(),
                title: String(n.title ?? "Notification"),
                subtitle: n.description ? String(n.description).slice(0, 80) : undefined,
                score: scoreMatch(q, String(n.title ?? "")),
              });
            }
          })
          .catch(() => undefined)
      );
    }

    if (wantsKind(types, "route")) {
      tasks.push(
        SavedRoutes.find({
          organizationId: orgOid,
          $or: [{ title: rx }, { prompt: rx }],
        })
          .limit(perKindLimit)
          .select("title prompt")
          .then((rows) => {
            for (const r of rows) {
              hits.push({
                kind: "route",
                id: r._id.toString(),
                title: r.title,
                subtitle: r.prompt?.slice(0, 80),
                score: scoreMatch(q, r.title, r.prompt),
              });
            }
          })
          .catch(() => undefined)
      );
    }

    if (wantsKind(types, "category")) {
      tasks.push(
        Categories.find({ title: rx })
          .limit(perKindLimit)
          .select("title tagline")
          .then((rows) => {
            for (const c of rows as any[]) {
              hits.push({
                kind: "category",
                id: c._id.toString(),
                title: c.title,
                subtitle: c.tagline || undefined,
                score: scoreMatch(q, c.title, c.tagline),
              });
            }
          })
          .catch(() => undefined)
      );
    }

    if (wantsKind(types, "help")) {
      tasks.push(
        HelpArticles.find({
          published: true,
          $or: [{ title: rx }, { body: rx }, { tags: rx }],
        })
          .limit(perKindLimit)
          .select("title slug category")
          .then((rows) => {
            for (const h of rows) {
              hits.push({
                kind: "help",
                id: h.slug,
                title: h.title,
                subtitle: h.category,
                score: scoreMatch(q, h.title),
              });
            }
          })
          .catch(() => undefined)
      );
    }

    if (wantsKind(types, "execution")) {
      tasks.push(
        (async () => {
          try {
            const { EnterpriseExecution } = await import(
              "../platform/infrastructure/durability/mongo/models/enterprise-execution.model"
            );
            const rows = await EnterpriseExecution.find({
              organizationId,
              promptPreview: rx,
            })
              .limit(perKindLimit)
              .select("promptPreview status executionId");
            for (const e of rows as any[]) {
              hits.push({
                kind: "execution",
                id: e.executionId,
                title: e.promptPreview || "Execution",
                subtitle: e.status,
                score: scoreMatch(q, e.promptPreview || ""),
              });
            }
          } catch {
            // Enterprise execution store unavailable — not a hard failure.
          }
        })()
      );
    }

    if (wantsKind(types, "document")) {
      tasks.push(
        searchKnowledgeChunks({ organizationId, brandId, q, limit: perKindLimit })
          .then((docHits) => {
            hits.push(...docHits);
          })
          .catch(() => undefined)
      );
    }

    if (wantsKind(types, "conversation") && userOid) {
      tasks.push(
        (async () => {
          try {
            const memberships = await ConversationMember.find({
              userId: userOid,
            }).limit(200);
            const ids = memberships.map((m) => m.conversationId);
            const rows = await Conversation.find({
              _id: { $in: ids },
              $or: [{ name: rx }, { roomKey: rx }, { entityId: rx }, { entityKind: rx }],
            }).limit(perKindLimit);
            for (const r of rows) {
              hits.push({
                kind: "conversation",
                id: r.roomKey,
                title: r.name,
                subtitle: r.entityKind,
                score: scoreMatch(q, r.name, r.entityKind),
              });
            }
            const msgs = await CollabMessage.find({
              organizationId: orgOid,
              deletedAt: { $exists: false },
              text: rx,
            })
              .limit(perKindLimit)
              .select("text conversationId");
            for (const m of msgs) {
              hits.push({
                kind: "conversation",
                id: m._id.toString(),
                title: (m.text || "").slice(0, 80),
                subtitle: "message",
                score: scoreMatch(q, m.text || ""),
              });
            }
          } catch {
            /* legacy fallback */
            const rows = await ChatRoom.find({
              members: userOid,
              $or: [{ name: rx }, { roomId: rx }, { entityId: rx }],
            }).limit(perKindLimit);
            for (const r of rows as any[]) {
              hits.push({
                kind: "conversation",
                id: String(r.roomId),
                title: String(r.name || r.roomId || "Conversation"),
                subtitle: String(r.entityKind || r.room_type || "chat"),
                score: scoreMatch(q, String(r.name || r.roomId || "")),
              });
            }
          }
        })()
      );
    }

    // Keep approval searchable via notifications category when present
    if (wantsKind(types, "approval") && userOid) {
      tasks.push(
        Notifications.find({
          userId: userOid,
          $or: [
            { title: rx },
            { description: rx },
            { category: /approval/i },
          ],
        })
          .limit(perKindLimit)
          .then((rows) => {
            for (const n of rows) {
              hits.push({
                kind: "approval",
                id: n._id.toString(),
                title: n.title,
                subtitle: n.description?.slice(0, 80),
                score: scoreMatch(q, n.title, n.description),
              });
            }
          })
          .catch(() => undefined)
      );
    }

    await Promise.all(tasks);
    return hits;
  }

  /** Prefix suggestions from recent queries + a couple of live entity titles. */
  async suggestions(input: {
    userId: string;
    organizationId?: string;
    q: string;
    limit?: number;
  }): Promise<{ query: string; suggestions: string[] }> {
    const q = String(input.q ?? "").trim();
    const limit = Math.min(input.limit ?? 8, 20);
    if (!q) return { query: "", suggestions: [] };

    let organizationId: string | undefined;
    try {
      organizationId = await resolveCustomerOrganizationId(
        input.userId,
        input.organizationId
      );
    } catch {
      organizationId = undefined;
    }

    const suggestions = new Set<string>();
    const rx = { $regex: `^${q}`, $options: "i" };

    if (mongoose.isValidObjectId(input.userId)) {
      const recents = await SearchRecent.find({
        userId: input.userId,
        query: rx,
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select("query");
      recents.forEach((r) => suggestions.add(r.query));
    }

    if (organizationId) {
      const brands = await Brands.find({
        organizationId,
        status: "active",
        name: rx,
      })
        .limit(limit)
        .select("name");
      brands.forEach((b) => suggestions.add(b.name));
    }

    return { query: q, suggestions: [...suggestions].slice(0, limit) };
  }

  async recordRecent(input: {
    userId: string;
    organizationId?: string;
    query: string;
  }): Promise<void> {
    const query = input.query.trim();
    if (!query || !mongoose.isValidObjectId(input.userId)) return;
    await SearchRecent.create({
      userId: input.userId,
      organizationId: mongoose.isValidObjectId(input.organizationId)
        ? input.organizationId
        : undefined,
      query,
    });
  }

  async listRecent(input: {
    userId: string;
    organizationId?: string;
    limit?: number;
  }): Promise<{ query: string; createdAt: string }[]> {
    if (!mongoose.isValidObjectId(input.userId)) return [];
    const limit = Math.min(input.limit ?? 10, 50);
    const rows = await SearchRecent.find({ userId: input.userId })
      .sort({ createdAt: -1 })
      .limit(limit * 3);
    // De-duplicate by query text, keep most recent.
    const seen = new Set<string>();
    const out: { query: string; createdAt: string }[] = [];
    for (const r of rows) {
      const key = r.query.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ query: r.query, createdAt: r.createdAt.toISOString() });
      if (out.length >= limit) break;
    }
    return out;
  }

  async clearRecent(input: {
    userId: string;
    organizationId?: string;
  }): Promise<{ cleared: true }> {
    if (mongoose.isValidObjectId(input.userId)) {
      await SearchRecent.deleteMany({ userId: input.userId });
    }
    return { cleared: true };
  }

  private async audit(input: {
    userId?: string;
    organizationId?: string;
    brandId?: string;
    query: string;
    latencyMs: number;
    resultCount: number;
  }): Promise<void> {
    await SearchAudit.create({
      userId: input.userId,
      organizationId: input.organizationId,
      brandId: input.brandId,
      query: input.query,
      latencyMs: input.latencyMs,
      resultCount: input.resultCount,
    });
  }
}

export const productSearchService = new ProductSearchService();
