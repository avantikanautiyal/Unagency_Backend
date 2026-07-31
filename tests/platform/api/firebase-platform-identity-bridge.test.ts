import { Types } from "mongoose";
import { FirebaseAuthenticationAdapter } from "../../../src/platform/api/auth/firebase/firebase-authentication-adapter";
import { createCompositeAuthenticationService } from "../../../src/platform/api/auth/composite-authentication-service";
import { mapLegacyRoleToPlatformRoles } from "../../../src/platform/api/auth/firebase/role-permission-mapper";
import { setupEnterpriseApi, loginDemo } from "../../../src/platform/api/testing";
import { InMemoryTenantService } from "../../../src/platform/api/tenants/in-memory-tenant-service";
import { BridgedTenantService } from "../../../src/platform/api/tenants/bridged-tenant-service";
import { permissionsForRoles } from "../../../src/platform/api/authorization/rbac";

jest.mock("../../../src/models/users.model", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock("../../../src/models/organization.model", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findById: jest.fn() },
}));

import Users from "../../../src/models/users.model";
import Organizations from "../../../src/models/organization.model";

describe("Firebase authentication adapter", () => {
  const nowIso = () => "2026-07-27T00:00:00.000Z";
  const clockMs = () => 1_000;
  let seq = 0;
  const createId = (prefix: string) => `${prefix}_${++seq}`;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("maps legacy roles to platform roles with permissions", () => {
    expect(mapLegacyRoleToPlatformRoles("superadmin")).toEqual(["owner"]);
    expect(mapLegacyRoleToPlatformRoles("customer", { isOrganizationOwner: true })).toEqual([
      "owner",
    ]);
    expect(mapLegacyRoleToPlatformRoles("resource")).toEqual(["member"]);
    expect(permissionsForRoles(["owner"]).includes("admin:*")).toBe(true);
    expect(permissionsForRoles(["member"]).includes("execution:create")).toBe(true);
  });

  it("resolves Firebase token to AuthPrincipal with Mongo org sync", async () => {
    const tenantStore = new InMemoryTenantService(nowIso, createId);
    const tenants = new BridgedTenantService(tenantStore);
    const orgId = new Types.ObjectId();
    const userId = new Types.ObjectId();

    (Users.findOne as jest.Mock).mockResolvedValue({
      _id: userId,
      firebaseId: "firebase_uid_1",
      role: "customer",
      email: "customer@example.com",
      isActive: true,
    });
    (Organizations.findOne as jest.Mock).mockResolvedValue({
      _id: orgId,
      companyName: "Acme Corp",
      owner: userId,
    });

    const adapter = new FirebaseAuthenticationAdapter({
      tenants,
      verifyIdToken: async () => ({
        uid: "firebase_uid_1",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    });

    const result = await adapter.authenticate(
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJ4In0.sig"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toMatchObject({
      userId: userId.toString(),
      organizationId: orgId.toString(),
      roles: ["owner"],
      kind: "user",
    });

    const org = tenantStore.getOrganization(orgId.toString());
    expect(org.ok && org.value?.name).toBe("Acme Corp");
  });

  it("authenticates platform jwt tokens before attempting Firebase", async () => {
    const platform = setupEnterpriseApi({ enableFirebaseBridge: true });
    const { token } = await loginDemo(platform);

    const authed = await platform.auth.authenticate({
      scheme: "jwt",
      token,
    });

    expect(authed.ok).toBe(true);
  });

  it("routes Firebase-shaped tokens to the adapter when enabled", async () => {
    const tenantStore = new InMemoryTenantService(nowIso, createId);
    const tenants = new BridgedTenantService(tenantStore);
    const auth = createCompositeAuthenticationService({ nowIso, createId, clockMs });
    const adapter = new FirebaseAuthenticationAdapter({
      tenants,
      verifyIdToken: async () => ({
        uid: "firebase_uid_2",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    });
    auth.setFirebaseAdapter(adapter);

    const userId = new Types.ObjectId();
    (Users.findOne as jest.Mock).mockResolvedValue({
      _id: userId,
      firebaseId: "firebase_uid_2",
      role: "admin",
      email: "admin@example.com",
      isActive: true,
    });

    const authed = await auth.authenticate({
      scheme: "jwt",
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJ4In0.sig",
    });

    expect(authed.ok).toBe(true);
    if (!authed.ok) return;
    expect(authed.value.roles).toEqual(["admin"]);
    expect(authed.value.userId).toBe(userId.toString());
  });
});
