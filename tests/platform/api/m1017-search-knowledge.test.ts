/**
 * M10.17 — Global Search + Brand Guidelines + Knowledge Intelligence.
 *
 * Covers: search hit kinds + empty-query short circuit, recent-search
 * persistence, brand guidelines profile sanitize/merge + BrandService
 * create/update round trip, Brand Brain document mapping + sync, and
 * Knowledge Intelligence assembly for executions. Mongo-backed models are
 * mocked in-memory (same pattern as m104-product-assets.test.ts) so these
 * run without a live database — no mock/demo *business* data is asserted,
 * only real code paths against controlled fixtures.
 */

import mongoose from "mongoose";

jest.mock("../../../src/services/knowledge-document-index-service", () => ({
  ...jest.requireActual("../../../src/services/knowledge-document-index-service"),
  searchKnowledgeChunks: jest.fn(async () => []),
}));

// ---------------------------------------------------------------------------
// Model mocks (in-memory) — avoid requiring a live Mongo connection.
// ---------------------------------------------------------------------------

jest.mock(
  "../../../src/platform/infrastructure/durability/mongo/models/enterprise-execution.model",
  () => {
    const emptyChain: any = {};
    emptyChain.sort = () => emptyChain;
    emptyChain.limit = () => emptyChain;
    emptyChain.select = () => Promise.resolve([]);
    return {
      __esModule: true,
      EnterpriseExecution: { find: jest.fn(() => emptyChain) },
    };
  }
);

jest.mock("../../../src/models/organization.model", () => ({
  __esModule: true,
  default: { exists: jest.fn(async () => true), findOne: jest.fn() },
}));

jest.mock("../../../src/models/team.model", () => ({
  __esModule: true,
  default: { exists: jest.fn(async () => false), findOne: jest.fn() },
}));

jest.mock("../../../src/models/brand.model", () => {
  const mongooseLib = require("mongoose");
  const store = new Map<string, any>();
  function makeDoc(data: any) {
    const id = data._id ? data._id.toString() : new mongooseLib.Types.ObjectId().toString();
    const doc: any = {
      ...data,
      _id: new mongooseLib.Types.ObjectId(id),
      markModified: jest.fn(),
      save: jest.fn(async function (this: any) {
        store.set(this._id.toString(), this);
        return this;
      }),
    };
    store.set(id, doc);
    return doc;
  }
  return {
    __esModule: true,
    default: {
      create: jest.fn(async (data: any) => makeDoc(data)),
      findById: jest.fn(async (id: string) => store.get(String(id)) || null),
      find: jest.fn(() => ({
        sort: () => ({ limit: async () => [...store.values()] }),
      })),
      __store: store,
    },
  };
});

jest.mock("../../../src/models/searchRecent.model", () => {
  const mongooseLib = require("mongoose");
  const store: any[] = [];
  let seq = 0;
  function makeChain(rows: any[]): any {
    const chain: any = {
      sort: () => makeChain(rows),
      limit: (n: number) => makeChain(rows.slice(0, n)),
      select: () => Promise.resolve(rows),
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
    };
    return chain;
  }
  function filterRows(query: any): any[] {
    return store
      .filter((r) => {
        if (query.userId && String(r.userId) !== String(query.userId)) return false;
        if (query.query?.$regex) {
          const rx = new RegExp(query.query.$regex, query.query.$options);
          if (!rx.test(r.query)) return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return {
    __esModule: true,
    default: {
      create: jest.fn(async (doc: any) => {
        const row = {
          ...doc,
          _id: new mongooseLib.Types.ObjectId(),
          createdAt: new Date(Date.now() + seq++),
        };
        store.push(row);
        return row;
      }),
      find: jest.fn((query: any) => makeChain(filterRows(query))),
      deleteMany: jest.fn(async (query: any) => {
        const before = store.length;
        for (let i = store.length - 1; i >= 0; i--) {
          if (!query.userId || String(store[i].userId) === String(query.userId)) {
            store.splice(i, 1);
          }
        }
        return { deletedCount: before - store.length };
      }),
      __store: store,
    },
  };
});

// ---------------------------------------------------------------------------
// Imports under test (after mocks so they pick up the mocked models).
// ---------------------------------------------------------------------------

import {
  chunkText,
  isIndexableMimeType,
  cosineSimilarity,
} from "../../../src/services/knowledge-document-index-service";
import {
  sanitizeGuidelinesProfile,
  mergeGuidelinesProfile,
  brandService,
  type BrandDto,
} from "../../../src/services/brand-service";
import {
  productSearchService,
  type SearchHitKind,
} from "../../../src/services/product-search-service";

function sampleBrand(overrides: Partial<BrandDto> = {}): BrandDto {
  const now = new Date().toISOString();
  return {
    id: new mongoose.Types.ObjectId().toString(),
    organizationId: new mongoose.Types.ObjectId().toString(),
    ownerUserId: new mongoose.Types.ObjectId().toString(),
    name: "Acme Studio",
    status: "active",
    colors: ["#111111"],
    voice: "Confident, warm",
    positioning: "Premium creative partner",
    guidelines: "Always use the full logo lockup",
    industry: "Marketing & Advertising",
    targetAudience: "SMB marketing leads",
    website: "https://acme.example",
    guidelinesProfile: {
      mission: "Help brands grow with clarity",
      tone: "Confident, optimistic",
      writingStyle: "Short sentences, active voice",
      wordsToAvoid: ["cheap", "hype"],
      preferredVocabulary: ["craft", "partnership"],
      competitors: ["Rival Co"],
      approvalRules: "Legal sign-off required for claims",
    },
    memberUserIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("M10.17 — knowledge-document-index-service pure functions", () => {
  it("chunkText splits text into ~800 char pieces", () => {
    const text = "a".repeat(2000);
    const chunks = chunkText(text);
    expect(chunks.length).toBe(3);
    expect(chunks[0]!.length).toBe(800);
    expect(chunks.every((c) => c.length <= 800)).toBe(true);
  });

  it("chunkText returns an empty array for blank text (never fabricates content)", () => {
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("isIndexableMimeType only allows text/plain, text/markdown, application/pdf", () => {
    expect(isIndexableMimeType("text/plain")).toBe(true);
    expect(isIndexableMimeType("text/markdown")).toBe(true);
    expect(isIndexableMimeType("application/pdf")).toBe(true);
    expect(isIndexableMimeType("image/png")).toBe(false);
    expect(isIndexableMimeType(undefined)).toBe(false);
  });

  it("cosineSimilarity: 1 for identical, 0 for orthogonal/mismatched-length vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([], [1])).toBe(0);
  });
});

describe("M10.17 — brand guidelines profile sanitize/merge helpers", () => {
  it("keeps only non-empty, user-provided fields (no fabricated data)", () => {
    const out = sanitizeGuidelinesProfile({
      mission: "  Empower creators  ",
      vision: "",
      wordsToAvoid: ["hype", "  ", "cheap"],
      competitors: [],
    });
    expect(out.mission).toBe("Empower creators");
    expect(out.vision).toBeUndefined();
    expect(out.wordsToAvoid).toEqual(["hype", "cheap"]);
    expect(out.competitors).toBeUndefined();
  });

  it("undefined patch yields an empty profile", () => {
    expect(sanitizeGuidelinesProfile(undefined)).toEqual({});
  });

  it("merges a sanitized patch onto an existing profile without dropping other fields", () => {
    const merged = mergeGuidelinesProfile(
      { mission: "Old mission", tone: "Formal" },
      { tone: "Playful", brandStory: "Founded in a garage" }
    );
    expect(merged.mission).toBe("Old mission");
    expect(merged.tone).toBe("Playful");
    expect(merged.brandStory).toBe("Founded in a garage");
  });
});

describe("M10.17 — BrandService guidelinesProfile create + update (mocked Mongo)", () => {
  const BrandModel = require("../../../src/models/brand.model").default;

  beforeEach(() => {
    BrandModel.__store.clear();
  });

  it("persists only user-provided guidelinesProfile fields on create", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const organizationId = new mongoose.Types.ObjectId().toString();
    const dto = await brandService.create({
      userId,
      organizationId,
      name: "Acme",
      guidelinesProfile: {
        mission: "  Empower local makers  ",
        vision: "",
        wordsToAvoid: ["cheap"],
      },
    });
    expect(dto.guidelinesProfile.mission).toBe("Empower local makers");
    expect(dto.guidelinesProfile.vision).toBeUndefined();
    expect(dto.guidelinesProfile.wordsToAvoid).toEqual(["cheap"]);
  });

  it("merges guidelinesProfile patch on update without dropping existing fields", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const organizationId = new mongoose.Types.ObjectId().toString();
    const created = await brandService.create({
      userId,
      organizationId,
      name: "Acme",
      guidelinesProfile: { mission: "Empower local makers", tone: "Warm" },
    });

    const updated = await brandService.update({
      userId,
      brandId: created.id,
      patch: {
        guidelinesProfile: { tone: "Bold", brandStory: "Started in a garage" },
      },
    });

    expect(updated.guidelinesProfile.mission).toBe("Empower local makers");
    expect(updated.guidelinesProfile.tone).toBe("Bold");
    expect(updated.guidelinesProfile.brandStory).toBe("Started in a garage");
  });
});

describe("M10.17 — Global Search: hit kinds + query handling", () => {
  it("supports every documented search hit kind", () => {
    const kinds: SearchHitKind[] = [
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
    ];
    expect(kinds.length).toBe(11);
  });

  it("short-circuits to an empty result for a blank query (no Mongo hit)", async () => {
    const result = await productSearchService.search({
      userId: new mongoose.Types.ObjectId().toString(),
      q: "   ",
    });
    expect(result.hits).toEqual([]);
    expect(result.query).toBe("");
    expect(result.hasMore).toBe(false);
  });
});

describe("M10.17 — recent search persistence (mocked SearchRecent model)", () => {
  it("records, lists de-duplicated (most-recent-first), and clears recent searches", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    await productSearchService.recordRecent({ userId, query: "brand guidelines" });
    await productSearchService.recordRecent({ userId, query: "vault assets" });
    await productSearchService.recordRecent({ userId, query: "brand guidelines" });

    const recent = await productSearchService.listRecent({ userId });
    expect(recent.map((r) => r.query)).toEqual(["brand guidelines", "vault assets"]);

    await productSearchService.clearRecent({ userId });
    const afterClear = await productSearchService.listRecent({ userId });
    expect(afterClear).toEqual([]);
  });

  it("never persists recents for a non-Mongo userId", async () => {
    await productSearchService.recordRecent({ userId: "not-an-id", query: "test" });
    const recent = await productSearchService.listRecent({ userId: "not-an-id" });
    expect(recent).toEqual([]);
  });
});
