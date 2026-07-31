/**
 * M10.3 tenant isolation + RBAC checks via GET /v1/me memberships.
 */

import { Types } from "mongoose";
import { CurrentPrincipalService } from "../../../src/platform/api/services/current-principal-service";
import { BridgedTenantService } from "../../../src/platform/api/tenants/bridged-tenant-service";
import { InMemoryTenantService } from "../../../src/platform/api/tenants/in-memory-tenant-service";
import type { AuthPrincipal } from "../../../src/platform/api/contracts";

jest.mock("../../../src/models/users.model", () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}));
jest.mock("../../../src/models/organization.model", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findById: jest.fn() },
}));
jest.mock("../../../src/models/team.model", () => ({
  __esModule: true,
  default: { find: jest.fn(), findOne: jest.fn() },
}));

import Users from "../../../src/models/users.model";
import Organizations from "../../../src/models/organization.model";
import Teams from "../../../src/models/team.model";

describe("M10.3 tenant isolation via /v1/me memberships", () => {
  const nowIso = () => "2026-07-30T00:00:00.000Z";
  let seq = 0;
  const createId = (prefix: string) => `${prefix}_${++seq}`;

  beforeEach(() => {
    jest.clearAllMocks();
    seq = 0;
  });

  it("does not expose Tenant B organisation in Tenant A memberships", async () => {
    const userA = new Types.ObjectId();
    const orgA = new Types.ObjectId();
    const orgB = new Types.ObjectId();

    (Users.findById as jest.Mock).mockResolvedValue({
      _id: userA,
      firebaseId: "uid_a",
      email: "a@example.com",
      name: "A",
      role: "customer",
      isActive: true,
      contact: "",
    });
    (Organizations.findOne as jest.Mock).mockResolvedValue({
      _id: orgA,
      companyName: "Org A",
      owner: userA,
    });
    (Teams.find as jest.Mock).mockResolvedValue([]);

    const memory = new InMemoryTenantService(nowIso, createId);
    // Seed Tenant B in Enterprise memory — must not leak into A's /v1/me
    memory.registerOrganization({
      organizationId: String(orgB),
      name: "Org B",
      createdAt: nowIso(),
      status: "active",
    });
    memory.createWorkspace(String(orgB), "Default");

    const tenants = new BridgedTenantService(memory);
    // Mirror org A Default workspace
    memory.registerOrganization({
      organizationId: String(orgA),
      name: "Org A",
      createdAt: nowIso(),
      status: "active",
    });
    memory.createWorkspace(String(orgA), "Default");

    const service = new CurrentPrincipalService({ tenants });
    const principal: AuthPrincipal = {
      principalId: userA.toString(),
      kind: "user",
      userId: userA.toString(),
      organizationId: orgA.toString(),
      roles: ["owner"],
      sessionId: "firebase_uid_a",
    };
    const me = await service.getMe(principal);
    expect(me.ok).toBe(true);
    if (!me.ok) return;
    const orgIds = me.value.memberships.map((m) => m.organizationId);
    expect(orgIds).toContain(orgA.toString());
    expect(orgIds).not.toContain(orgB.toString());
    expect(
      me.value.workspaces.every((w) => w.organizationId === orgA.toString())
    ).toBe(true);
  });

  it("viewer permissions do not include org:write", async () => {
    const userId = new Types.ObjectId();
    (Users.findById as jest.Mock).mockResolvedValue({
      _id: userId,
      firebaseId: "uid_v",
      email: "v@example.com",
      name: "V",
      role: "customer",
      isActive: true,
      contact: "",
    });
    (Organizations.findOne as jest.Mock).mockResolvedValue(null);
    (Teams.find as jest.Mock).mockResolvedValue([]);

    const service = new CurrentPrincipalService();
    const me = await service.getMe({
      principalId: userId.toString(),
      kind: "user",
      userId: userId.toString(),
      roles: ["viewer"],
      sessionId: "firebase_uid_v",
    });
    expect(me.ok).toBe(true);
    if (!me.ok) return;
    expect(me.value.permissions).not.toContain("org:write");
    expect(me.value.permissions).toContain("org:read");
  });
});
