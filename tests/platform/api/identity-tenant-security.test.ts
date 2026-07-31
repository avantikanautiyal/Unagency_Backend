/**
 * M9.2B security tests — fail-closed authentication and tenant isolation.
 */

import { Types } from "mongoose";
import { FirebaseAuthenticationAdapter } from "../../../src/platform/api/auth/firebase/firebase-authentication-adapter";
import { createCompositeAuthenticationService } from "../../../src/platform/api/auth/composite-authentication-service";
import { resolveTenantContext } from "../../../src/platform/api/auth/tenant-resolution";
import { setupEnterpriseApi, loginDemo } from "../../../src/platform/api/testing";
import { InMemoryTenantService } from "../../../src/platform/api/tenants/in-memory-tenant-service";
import { BridgedTenantService } from "../../../src/platform/api/tenants/bridged-tenant-service";
import { hasPermission, permissionsForRoles } from "../../../src/platform/api/authorization/rbac";

jest.mock("../../../src/models/users.model", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock("../../../src/models/organization.model", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findById: jest.fn() },
}));

jest.mock("../../../src/models/team.model", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

import Users from "../../../src/models/users.model";
import Organizations from "../../../src/models/organization.model";

describe("M9.2B security", () => {
  const nowIso = () => "2026-07-27T00:00:00.000Z";
  const clockMs = () => 1_000;
  let seq = 0;
  const createId = (prefix: string) => `${prefix}_${++seq}`;
  const firebaseToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJzZWN1cml0eSJ9.sig";

  beforeEach(() => jest.clearAllMocks());

  it("rejects forged Firebase claims without Mongo identity", async () => {
    const tenants = new BridgedTenantService(new InMemoryTenantService(nowIso, createId));
    const auth = createCompositeAuthenticationService({ nowIso, createId, clockMs });
    auth.setFirebaseAdapter(
      new FirebaseAuthenticationAdapter({
        tenants,
        autoProvisionUser: false,
        verifyIdToken: async () => ({
          uid: "attacker_uid",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      })
    );
    (Users.findOne as jest.Mock).mockResolvedValue(null);

    const result = await auth.authenticate({ scheme: "jwt", token: firebaseToken });
    expect(result.ok).toBe(false);
  });

  it("prevents viewer role from execution:create escalation", () => {
    const viewerPerms = permissionsForRoles(["viewer"]);
    expect(hasPermission(viewerPerms, ["execution:create"])).toBe(false);
  });

  it("prevents tenant spoofing for Firebase principals", () => {
    const tenant = resolveTenantContext(
      {
        requestId: "r",
        method: "GET",
        path: "/v1/executions",
        version: "v1",
        headers: {},
        body: { organizationId: "injected_org" },
        query: { organizationId: "injected_org" },
      },
      {
        principalId: "u",
        kind: "user",
        userId: "u",
        organizationId: "real_org",
        roles: ["owner"],
        sessionId: "firebase_real",
      },
      { organizationId: "param_org" }
    );
    expect(tenant?.organizationId).toBe("real_org");
  });

  it("does not confuse platform jwt with Firebase path", async () => {
    const platform = setupEnterpriseApi({ enableFirebaseBridge: true });
    const { token } = await loginDemo(platform);
    const authed = await platform.auth.authenticate({ scheme: "jwt", token });
    expect(authed.ok).toBe(true);
    if (!authed.ok) return;
    expect(authed.value.sessionId?.startsWith("firebase_")).toBe(false);
  });

  it("fails closed when Firebase adapter is disabled and token is unknown", async () => {
    const platform = setupEnterpriseApi({ enableFirebaseBridge: false });
    const authed = await platform.auth.authenticate({
      scheme: "jwt",
      token: firebaseToken,
    });
    expect(authed.ok).toBe(false);
  });

  it("returns insufficient permissions as authorization failure at gateway", async () => {
    const platform = setupEnterpriseApi({ enableFirebaseBridge: true });
    const tenants = new BridgedTenantService(new InMemoryTenantService(nowIso, createId));
    const userId = new Types.ObjectId();
    const orgId = new Types.ObjectId();

    (Users.findOne as jest.Mock).mockResolvedValue({
      _id: userId,
      firebaseId: "firebase_uid_viewer",
      role: "unknown_role",
      isActive: true,
    });
    (Organizations.findOne as jest.Mock).mockResolvedValue({
      _id: orgId,
      companyName: "Co",
      owner: userId,
    });

    const auth = platform.auth as import("../../../src/platform/api/auth/composite-authentication-service").CompositeAuthenticationService;
    auth.setFirebaseAdapter(
      new FirebaseAuthenticationAdapter({
        tenants,
        verifyIdToken: async () => ({
          uid: "firebase_uid_viewer",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      })
    );

    const authed = await auth.authenticate({
      scheme: "jwt",
      token: firebaseToken,
    });
    expect(authed.ok).toBe(true);
    if (!authed.ok) return;

    const denied = await platform.gateway.handle({
      requestId: "req_denied",
      method: "POST",
      path: "/v1/executions",
      version: "v1",
      headers: { authorization: `Bearer ${firebaseToken}` },
      body: {
        prompt: "x",
        organizationId: orgId.toString(),
      },
    });

    // Viewer mapped role should not have execution:create
    expect(denied.ok && denied.value.status).toBe(403);
  });
});
