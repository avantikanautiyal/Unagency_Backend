/**
 * HTTP integration — Firebase ID token authentication on Enterprise API routes.
 */

import express from "express";
import { Types } from "mongoose";
import request from "supertest";
import { setupEnterpriseApi } from "../../src/platform/api/testing";
import { createExpressPlatformAdapter } from "../../src/platform/api/transports/express";
import { FirebaseAuthenticationAdapter } from "../../src/platform/api/auth/firebase/firebase-authentication-adapter";
import { CompositeAuthenticationService } from "../../src/platform/api/auth/composite-authentication-service";
import { BridgedTenantService } from "../../src/platform/api/tenants/bridged-tenant-service";
import { LegacyUserIdentityResolver } from "../../src/platform/api/auth/firebase/legacy-user-identity-resolver";
import { resolveEnterpriseApiExecutionMode } from "../../src/platform/api/runtime/execution-mode";

describe("Express Firebase Enterprise API auth (HTTP)", () => {
  jest.setTimeout(15_000);

  let app: express.Express;

  const firebaseToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJodHRwX2ZpcmViYXNlIn0.sig";

  const userId = new Types.ObjectId();
  const orgId = new Types.ObjectId();

  function wireFirebaseAdapter(
    overrides: {
      verifyUid?: string;
      verifyError?: Error;
      mongoUser?: Record<string, unknown> | null;
    } = {}
  ) {
    const platform = setupEnterpriseApi({
      enableFirebaseBridge: true,
      seedDemoTenant: false,
    });
    const auth = platform.auth as CompositeAuthenticationService;
    const tenants = platform.tenants as BridgedTenantService;

    auth.setFirebaseAdapter(
      new FirebaseAuthenticationAdapter({
        tenants,
        verifyIdToken: async () => {
          if (overrides.verifyError) throw overrides.verifyError;
          return {
            uid: overrides.verifyUid ?? "http_firebase",
            email: "firebase@example.com",
            email_verified: true,
            exp: Math.floor(Date.now() / 1000) + 3600,
          } as never;
        },
        identityResolver: new LegacyUserIdentityResolver({
          findUserByFirebaseId: async () =>
            overrides.mongoUser === null
              ? null
              : ({
                  _id: userId,
                  firebaseId: overrides.verifyUid ?? "http_firebase",
                  role: "customer",
                  email: "firebase@example.com",
                  isActive: true,
                  ...overrides.mongoUser,
                } as never),
          findOrganizationByOwner: async () => ({
            _id: orgId,
            companyName: "Firebase Org",
          }),
        }),
      })
    );

    const expressApp = express();
    expressApp.use(express.json());
    expressApp.use(createExpressPlatformAdapter({ gateway: platform.gateway }));
    return { expressApp, platform };
  }

  beforeAll(() => {
    const wired = wireFirebaseAdapter();
    app = wired.expressApp;
  });

  it("authenticates protected /v1/capabilities with Firebase ID token", async () => {
    const res = await request(app)
      .get("/v1/capabilities")
      .set("Authorization", `Bearer ${firebaseToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("authenticates protected /v2 route with Firebase ID token", async () => {
    const res = await request(app)
      .get("/v2/capabilities")
      .set("Authorization", `Bearer ${firebaseToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["x-api-version"]).toBe("v2");
  });

  it("returns 401 for invalid Firebase token", async () => {
    const { expressApp } = wireFirebaseAdapter({
      verifyError: new Error("invalid token"),
    });

    const res = await request(expressApp)
      .get("/v1/capabilities")
      .set("Authorization", `Bearer ${firebaseToken}`);

    expect(res.status).toBe(401);
  });

  it("returns 401 when Firebase user is missing from Mongo", async () => {
    const { expressApp } = wireFirebaseAdapter({ mongoUser: null });

    const res = await request(expressApp)
      .get("/v1/capabilities")
      .set("Authorization", `Bearer ${firebaseToken}`);

    expect(res.status).toBe(401);
  });

  it("rejects client organizationId spoofing on tenant-scoped routes", async () => {
    const otherOrg = new Types.ObjectId();

    const res = await request(app)
      .post("/v1/executions")
      .set("Authorization", `Bearer ${firebaseToken}`)
      .send({
        prompt: "tenant spoof test",
        organizationId: otherOrg.toString(),
      });

    expect(res.status).toBe(403);
  });

  it("allows execution when organizationId matches server-resolved tenant", async () => {
    const res = await request(app)
      .post("/v1/executions")
      .set("Authorization", `Bearer ${firebaseToken}`)
      .send({
        prompt: "firebase execution",
        organizationId: orgId.toString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.data.executionId).toBeTruthy();
  });

  it("keeps /v1/health public without Firebase credentials", async () => {
    const res = await request(app).get("/v1/health");
    expect(res.status).toBe(200);
  });

  it("keeps execution mode STUB", () => {
    expect(resolveEnterpriseApiExecutionMode({})).toBe("stub");
  });
});
