/**
 * "Just Exploring" — personal workspace + hidden generic brand.
 */

jest.mock("../../src/background/queue/email.queue", () => ({
  EmailQueue: { add: jest.fn() },
}));
jest.mock("../../src/notifications/client-notification-service", () => ({
  dispatchClientNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/services/collaboration/collaboration-channel-service", () => ({
  collaborationChannelService: {
    isConfigured: () => false,
    provisionForBrand: jest.fn(),
  },
}));

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Users from "../../src/models/users.model";
import Organizations from "../../src/models/organization.model";
import Brands from "../../src/models/brand.model";
import Teams from "../../src/models/team.model";
import {
  ensureExplorerWorkspace,
  isGenericBrandId,
} from "../../src/services/explorer-workspace-service";
import { createOrganization } from "../../src/controllers/organizations.controller";
import { dispatchClientNotification } from "../../src/notifications/client-notification-service";
import { brandService } from "../../src/services/brand-service";
import { resolveBrandProfileContext } from "../../src/platform/os/creative/brand-profile-facts";

async function callCreate(userId: string, body: Record<string, unknown>) {
  let status = 0;
  let payload: any;
  const res: any = {
    status(code: number) {
      status = code;
      return res;
    },
    json(value: unknown) {
      payload = value;
      return res;
    },
  };
  const next = jest.fn();
  await (createOrganization as any)({ user: { userId }, body }, res, next);
  if (next.mock.calls.length) throw next.mock.calls[0][0];
  return { status, data: payload?.data };
}

describe("explorer workspace", () => {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await Promise.all([
      Users.deleteMany({}),
      Organizations.deleteMany({}),
      Brands.deleteMany({}),
      Teams.deleteMany({}),
    ]);
  });

  async function makeUser(name = "Asha") {
    const u = await Users.create({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: "customer",
      isVerified: true,
      firebaseId: `fb_${name}_${Date.now()}`,
    } as any);
    return String(u._id);
  }

  it("creates a personal workspace with one hidden generic brand, idempotently", async () => {
    const userId = await makeUser();
    const first = await ensureExplorerWorkspace(userId);
    const second = await ensureExplorerWorkspace(userId);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(String(second.organization._id)).toBe(String(first.organization._id));
    expect(second.genericBrandId).toBe(first.genericBrandId);
    expect(first.organization.accountType).toBe("exploring");
    expect(await Brands.countDocuments({})).toBe(1);
    expect(await Teams.countDocuments({ userId })).toBe(1);
    expect(await isGenericBrandId(first.genericBrandId)).toBe(true);
  });

  it("concurrent setup (onboarding screen + auth gate) never creates two workspaces", async () => {
    const userId = await makeUser("Ravi");
    const results = await Promise.all([
      ensureExplorerWorkspace(userId),
      ensureExplorerWorkspace(userId),
      ensureExplorerWorkspace(userId),
    ]);
    expect(new Set(results.map((r) => String(r.organization._id))).size).toBe(1);
    expect(new Set(results.map((r) => r.genericBrandId)).size).toBe(1);
    expect(await Organizations.countDocuments({ owner: userId })).toBe(1);
    expect(await Brands.countDocuments({ isGeneric: true })).toBe(1);
    expect(await Teams.countDocuments({ userId })).toBe(1);
  });

  it("POST /organizations with accountType exploring needs no business fields and sends no brand prompt", async () => {
    const userId = await makeUser();
    const res = await callCreate(userId, { accountType: "exploring" });
    expect(res.status).toBe(200);
    expect(res.data.accountType).toBe("exploring");
    expect(typeof res.data.genericBrandId).toBe("string");
    expect(dispatchClientNotification).not.toHaveBeenCalled();

    // Re-running onboarding returns the same workspace — never a 409.
    const again = await callCreate(userId, { accountType: "exploring" });
    expect(again.status).toBe(200);
    expect(String(again.data._id)).toBe(String(res.data._id));
  });

  it("hides the generic brand from brand lists and keeps it out of generation facts", async () => {
    const userId = await makeUser();
    const { organization, genericBrandId } = await ensureExplorerWorkspace(userId);
    const organizationId = String(organization._id);

    const listed = await brandService.list({ userId, organizationId });
    expect(listed).toEqual([]);

    const withGeneric = await brandService.list({ userId, organizationId, includeGeneric: true });
    expect(withGeneric.map((b) => b.id)).toEqual([genericBrandId]);
    expect(withGeneric[0].isGeneric).toBe(true);

    const ctx = await resolveBrandProfileContext({ organizationId, brandId: genericBrandId });
    expect(ctx.facts).toEqual([]);
  });

  it("setting up a business later upgrades the personal workspace in place", async () => {
    const userId = await makeUser();
    const explorer = await callCreate(userId, { accountType: "exploring" });

    const business = await callCreate(userId, {
      companyName: "Asha Bakes",
      companyType: "Startup",
      industry: "Food",
      contactPerson: "Asha",
      contactMobile: "9999999999",
      contactEmail: "asha@example.com",
    });
    expect(business.status).toBe(200);
    expect(String(business.data._id)).toBe(String(explorer.data._id));
    expect(business.data.companyName).toBe("Asha Bakes");
    expect(business.data.accountType).toBe("business");
    expect(await Organizations.countDocuments({ owner: userId })).toBe(1);
    expect(await Teams.countDocuments({ userId })).toBe(1);
    expect(dispatchClientNotification).toHaveBeenCalledTimes(1);

    // A real business still cannot create a second organisation.
    const dup = await callCreate(userId, {
      companyName: "Other",
      companyType: "Startup",
      industry: "Food",
      contactPerson: "Asha",
      contactMobile: "9999999999",
      contactEmail: "asha@example.com",
    });
    expect(dup.status).toBe(409);
  });
});
