/**
 * M9.2B — Identity & tenant convergence tests.
 */

import { Types } from "mongoose";
import express from "express";
import request from "supertest";
import {
  FirebaseAuthenticationAdapter,
  mapLegacyRoleToPlatformRoles,
  permissionsForLegacyRole,
  buildLegacyRolePermissionMatrix,
  isFirebaseAuthenticatedPrincipal,
} from "../../../src/platform/api/auth/firebase";
import {
  CompositeAuthenticationService,
  createCompositeAuthenticationService,
} from "../../../src/platform/api/auth/composite-authentication-service";
import { resolveTenantContext } from "../../../src/platform/api/auth/tenant-resolution";
import { LegacyUserIdentityResolver } from "../../../src/platform/api/auth/firebase/legacy-user-identity-resolver";
import { setupEnterpriseApi, apiRequest, loginDemo } from "../../../src/platform/api/testing";
import { InMemoryTenantService } from "../../../src/platform/api/tenants/in-memory-tenant-service";
import { BridgedTenantService } from "../../../src/platform/api/tenants/bridged-tenant-service";
import { resolveEnterpriseApiExecutionMode } from "../../../src/platform/api/runtime/execution-mode";
import {
  bootstrapEnterpriseApiRuntime,
  getEnterpriseApiRuntime,
  resetEnterpriseApiRuntimeForTests,
} from "../../../src/platform/api/runtime";
import { createExpressPlatformAdapter } from "../../../src/platform/api/transports/express";
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
import Teams from "../../../src/models/team.model";

describe("M9.2B Identity & Tenant Convergence", () => {
  const nowIso = () => "2026-07-27T00:00:00.000Z";
  const clockMs = () => 1_000;
  let seq = 0;
  const createId = (prefix: string) => `${prefix}_${++seq}`;

  const firebaseToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJmaXJlYmFzZV91aWQifQ.sig";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("role → permission mapping", () => {
    it("documents centralized legacy role permission matrix", () => {
      const matrix = buildLegacyRolePermissionMatrix();
      expect(matrix.superadmin).toContain("admin:*");
      expect(hasPermission(matrix.customer, ["execution:create"])).toBe(true);
      expect(matrix.customer_team_member).toContain("execution:create");
      expect(matrix.resource).not.toContain("admin:*");
      expect(permissionsForLegacyRole("viewer" as never)).not.toContain("admin:*");
    });

    it("maps customer org owner to owner platform role", () => {
      const roles = mapLegacyRoleToPlatformRoles("customer", { isOrganizationOwner: true });
      expect(roles).toEqual(["owner"]);
      expect(hasPermission(permissionsForRoles(roles), ["execution:create"])).toBe(true);
    });
  });

  describe("Firebase authentication adapter", () => {
    function setupBridge() {
      const tenantStore = new InMemoryTenantService(nowIso, createId);
      const tenants = new BridgedTenantService(tenantStore);
      const adapter = new FirebaseAuthenticationAdapter({
        tenants,
        verifyIdToken: async () => ({
          uid: "firebase_uid_1",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      });
      const auth = createCompositeAuthenticationService({ nowIso, createId, clockMs });
      auth.setFirebaseAdapter(adapter);
      return { tenantStore, tenants, adapter, auth };
    }

    it("authenticates valid mocked Firebase token", async () => {
      const { auth } = setupBridge();
      const userId = new Types.ObjectId();
      const orgId = new Types.ObjectId();

      (Users.findOne as jest.Mock).mockResolvedValue({
        _id: userId,
        firebaseId: "firebase_uid_1",
        role: "customer",
        email: "c@example.com",
        isActive: true,
      });
      (Organizations.findOne as jest.Mock).mockResolvedValue({
        _id: orgId,
        companyName: "Acme",
        owner: userId,
      });

      const result = await auth.authenticate({ scheme: "jwt", token: firebaseToken });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(isFirebaseAuthenticatedPrincipal(result.value)).toBe(true);
      expect(result.value.organizationId).toBe(orgId.toString());
      expect(result.value.userId).toBe(userId.toString());
    });

    it("rejects invalid Firebase token", async () => {
      const { auth } = setupBridge();
      const adapter = new FirebaseAuthenticationAdapter({
        tenants: new BridgedTenantService(new InMemoryTenantService(nowIso, createId)),
        verifyIdToken: async () => {
          throw new Error("invalid token");
        },
      });
      auth.setFirebaseAdapter(adapter);

      const result = await auth.authenticate({ scheme: "jwt", token: firebaseToken });
      expect(result.ok).toBe(false);
    });

    it("rejects expired Firebase token", async () => {
      const { auth } = setupBridge();
      const adapter = new FirebaseAuthenticationAdapter({
        tenants: new BridgedTenantService(new InMemoryTenantService(nowIso, createId)),
        verifyIdToken: async () => {
          throw new Error("Firebase ID token has expired");
        },
      });
      auth.setFirebaseAdapter(adapter);

      const result = await auth.authenticate({ scheme: "jwt", token: firebaseToken });
      expect(result.ok).toBe(false);
    });

    it("rejects Firebase user missing from Mongo", async () => {
      const { auth } = setupBridge();
      (Users.findOne as jest.Mock).mockResolvedValue(null);

      const result = await auth.authenticate({ scheme: "jwt", token: firebaseToken });
      expect(result.ok).toBe(false);
    });

    it("rejects inactive Mongo user", async () => {
      const { auth } = setupBridge();
      (Users.findOne as jest.Mock).mockResolvedValue({
        _id: new Types.ObjectId(),
        firebaseId: "firebase_uid_1",
        role: "customer",
        isActive: false,
      });

      const result = await auth.authenticate({ scheme: "jwt", token: firebaseToken });
      expect(result.ok).toBe(false);
    });

    it("resolves team membership organisation server-side", async () => {
      const resolver = new LegacyUserIdentityResolver({
        findUserByFirebaseId: async () =>
          ({
            _id: new Types.ObjectId(),
            firebaseId: "uid",
            role: "customer",
            email: "m@example.com",
            isActive: true,
          }) as never,
        findOrganizationByOwner: async () => null,
        findAcceptedTeamMembership: async () => ({
          Organization: new Types.ObjectId("64b1f077bae350b1a437db5e"),
          role: "member",
        }),
      });

      const identity = await resolver.resolve({
        uid: "uid",
        email: "m@example.com",
      });
      expect(identity.ok).toBe(true);
      if (!identity.ok) return;
      expect(identity.value.organizationId).toBe("64b1f077bae350b1a437db5e");
      expect(identity.value.roleContext.teamRole).toBe("member");
    });

    it("still allows platform jwt_* authentication", async () => {
      const platform = setupEnterpriseApi({ enableFirebaseBridge: true });
      const { token } = await loginDemo(platform);
      const authed = await platform.auth.authenticate({ scheme: "jwt", token });
      expect(authed.ok).toBe(true);
      expect(isFirebaseAuthenticatedPrincipal(authed.ok ? authed.value : ({} as never))).toBe(
        false
      );
    });

    it("still allows api_key authentication", async () => {
      const platform = setupEnterpriseApi({ enableFirebaseBridge: true });
      const { token, organizationId } = await loginDemo(platform);
      const issued = await platform.gateway.handle(
        apiRequest({
          method: "POST",
          path: "/v1/auth/api-keys",
          headers: { authorization: `Bearer ${token}` },
          body: { name: "ci", roles: ["service"], organizationId },
        })
      );
      expect(issued.ok && issued.value.status).toBe(201);
      const apiKey = (issued.value.body as { data: { apiKey: string } }).data.apiKey;
      const authed = await platform.auth.authenticate({ scheme: "api_key", token: apiKey });
      expect(authed.ok).toBe(true);
    });
  });

  describe("tenant isolation", () => {
    it("does not allow Firebase principal tenant spoofing via body organizationId", () => {
      const principal = {
        principalId: "u1",
        kind: "user" as const,
        userId: "u1",
        organizationId: "org_a",
        roles: ["owner" as const],
        sessionId: "firebase_uid123",
      };

      const tenant = resolveTenantContext(
        {
          requestId: "r1",
          method: "POST",
          path: "/v1/executions",
          version: "v1",
          headers: {},
          body: { organizationId: "org_b" },
        },
        principal,
        {}
      );

      expect(tenant?.organizationId).toBe("org_a");
      expect(tenant?.organizationId).not.toBe("org_b");
    });

    it("blocks cross-tenant execution for Firebase users via gateway", async () => {
      const platform = setupEnterpriseApi();
      const orgA = platform.tenants.createOrganization("A");
      const orgB = platform.tenants.createOrganization("B");
      expect(orgA.ok && orgB.ok).toBe(true);
      if (!orgA.ok || !orgB.ok) return;

      platform.platformAuth.seedUser({
        email: "fb@example.com",
        password: "x",
        userId: "usr_fb",
        organizationId: orgA.value.organizationId,
        roles: ["owner"],
      });

      const principal = {
        principalId: "usr_fb",
        kind: "user" as const,
        userId: "usr_fb",
        organizationId: orgA.value.organizationId,
        roles: ["owner" as const],
        sessionId: "firebase_spoof_test",
      };

      const created = await platform.executions.create(
        {
          prompt: "test",
          organizationId: orgB.value.organizationId,
        },
        principal
      );
      expect(created.ok).toBe(false);
    });
  });

  describe("HTTP integration", () => {
    let app: express.Express;

    beforeAll(() => {
      resetEnterpriseApiRuntimeForTests();
      const runtime = bootstrapEnterpriseApiRuntime({
        enableFirebaseBridge: false,
        executionMode: "stub",
      });
      app = express();
      app.use(express.json());
      app.use(createExpressPlatformAdapter({ gateway: runtime.platform.gateway }));
    });

    it("keeps execution mode STUB", () => {
      const runtime = getEnterpriseApiRuntime();
      expect(runtime?.executionMode).toBe("stub");
      expect(resolveEnterpriseApiExecutionMode({})).toBe("stub");
    });

    it("keeps /v1/health public", async () => {
      const res = await request(app).get("/v1/health");
      expect(res.status).toBe(200);
    });

    it("returns 401 for protected route without credentials", async () => {
      const res = await request(app).get("/v1/capabilities");
      expect(res.status).toBe(401);
    });
  });
});
