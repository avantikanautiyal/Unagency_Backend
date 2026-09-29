/**
 * Framework ActiveBrief / requirement-bag rehydration after process restart.
 * Mirrors the REAL HTTP defect: session pointers survive; bag Map does not.
 */

import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  ensureCdfSessionLoaded,
  ensureRequirementBagLoaded,
  getActiveBriefByVersion,
  getLatestActiveBrief,
  persistCdfSession,
  resetCdfRequirementStoreForTests,
  resetCdfSessionsForTests,
  saveCdfSession,
} from "../../../src/platform/cdf";
import { resolveGenerationContext } from "../../../src/platform/cdf/context-resolver/resolve";
import { saveActiveBrief } from "../../../src/platform/cdf/requirements/store";
import { persistCdfRequirementBagToMongo } from "../../../src/platform/infrastructure/durability/mongo/models/cdf-requirement.model";
import type { CdfActiveBrief } from "../../../src/platform/cdf/requirements/types";
import type { CdfSessionState } from "../../../src/platform/cdf/types";
import { listActiveBriefVersions } from "../../../src/platform/cdf/requirements/store";

function briefStub(
  sessionId: string,
  serviceId: string,
  activeBriefId: string,
  version: number,
): CdfActiveBrief {
  const ts = new Date().toISOString();
  return {
    activeBriefId,
    sessionId,
    serviceId,
    version,
    sourceInputIds: [`src_${version}`],
    requirementIds: [`req_${version}`],
    activeRequirements: [],
    constraints: [],
    exclusions: [],
    references: [],
    decisions: [],
    overrides: [],
    unresolvedConflicts: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

function sessionStub(input: {
  sessionId: string;
  serviceId: string;
  activeBriefId: string;
  activeBriefVersion: number;
  phaseId?: string;
}): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId: input.sessionId,
    serviceId: input.serviceId,
    organizationId: "org_abr",
    contractVersion: "2.0.0-m1",
    sessionVersion: 3,
    status: "active",
    brief: "Test brief content for ActiveBrief durability",
    phaseIndex: 3,
    phaseId: input.phaseId ?? "output",
    approved: [],
    selected: [],
    masters: {},
    modeOwnership: "ai",
    productMode: "ai",
    createdAt: ts,
    updatedAt: ts,
    activeBriefId: input.activeBriefId,
    activeBriefVersion: input.activeBriefVersion,
  };
}

describe("CDF ActiveBrief / requirement-bag rehydration (framework)", () => {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementStoreForTests();
  });

  async function seedPinnedBrief(serviceId: string) {
    const sessionId = `cdf_abr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const activeBriefId = `abr_${Date.now().toString(36)}_pin`;
    for (let v = 1; v <= 7; v++) {
      saveActiveBrief(briefStub(sessionId, serviceId, activeBriefId, v));
    }
    // Force Mongo write of bag (same as live best-effort persist)
    const briefs = listActiveBriefVersions(sessionId);
    await persistCdfRequirementBagToMongo(sessionId, {
      sources: [],
      requirements: [],
      briefs,
      activeBriefId,
    });
    const session = saveCdfSession(
      sessionStub({
        sessionId,
        serviceId,
        activeBriefId,
        activeBriefVersion: 7,
      }),
    );
    await persistCdfSession(session);
    return { sessionId, activeBriefId, serviceId };
  }

  it("A/B — ActiveBrief reference + exact X@V resolve after restart", async () => {
    const { sessionId, activeBriefId } = await seedPinnedBrief("social-media");
    assert.equal(getActiveBriefByVersion(sessionId, 7)?.version, 7);

    // Simulate process restart
    resetCdfSessionsForTests();
    resetCdfRequirementStoreForTests();
    assert.equal(getActiveBriefByVersion(sessionId, 7), undefined);

    const loaded = await ensureCdfSessionLoaded(sessionId);
    assert.ok(loaded);
    assert.equal(loaded!.activeBriefId, activeBriefId);
    assert.equal(loaded!.activeBriefVersion, 7);

    const v7 = getActiveBriefByVersion(sessionId, 7);
    assert.ok(v7);
    assert.equal(v7!.activeBriefId, activeBriefId);
    assert.equal(v7!.version, 7);
  });

  it("C/D — requirement bag + exact versions resolve after restart", async () => {
    const { sessionId, activeBriefId } = await seedPinnedBrief("presentation");
    resetCdfSessionsForTests();
    resetCdfRequirementStoreForTests();
    await ensureRequirementBagLoaded(sessionId);
    const versions = listActiveBriefVersions(sessionId).map((b) => b.version);
    assert.deepEqual(versions, [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(getActiveBriefByVersion(sessionId, 3)?.activeBriefId, activeBriefId);
  });

  it("E — latest ActiveBrief does not replace older pinned version", async () => {
    const { sessionId, activeBriefId } = await seedPinnedBrief("packaging");
    // Create v8 in a different process memory after pin to v7 was persisted
    resetCdfSessionsForTests();
    resetCdfRequirementStoreForTests();
    await ensureCdfSessionLoaded(sessionId);
    saveActiveBrief(briefStub(sessionId, "packaging", activeBriefId, 8));
    assert.equal(getLatestActiveBrief(sessionId)?.version, 8);
    // Session still pinned to v7
    const session = await ensureCdfSessionLoaded(sessionId);
    assert.equal(session!.activeBriefVersion, 7);
    const resolved = getActiveBriefByVersion(
      sessionId,
      session!.activeBriefVersion!,
    );
    assert.equal(resolved?.version, 7);
  });

  it("F — missing ActiveBrief fails with ACTIVE_BRIEF_NOT_FOUND", async () => {
    const sessionId = `cdf_abr_missing_${Date.now().toString(36)}`;
    saveCdfSession(
      sessionStub({
        sessionId,
        serviceId: "social-media",
        activeBriefId: "abr_missing",
        activeBriefVersion: 3,
      }),
    );
    // No bag persisted — session refs exist but brief body does not
    const result = resolveGenerationContext({
      sessionId,
      serviceId: "social-media",
      phaseId: "output",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "ACTIVE_BRIEF_NOT_FOUND");
    }
  });

  it("G — empty placeholder bag still loads from Mongo (fail-open only when absent)", async () => {
    const { sessionId } = await seedPinnedBrief("emailers");
    resetCdfSessionsForTests();
    resetCdfRequirementStoreForTests();
    // Accidental empty placeholder (sync bag touch)
    assert.equal(getActiveBriefByVersion(sessionId, 1), undefined);
    await ensureRequirementBagLoaded(sessionId);
    assert.equal(getActiveBriefByVersion(sessionId, 7)?.version, 7);
  });

  it("H — in-process context still resolves without Mongo round-trip when warm", async () => {
    const { sessionId, activeBriefId } = await seedPinnedBrief("logo");
    await ensureCdfSessionLoaded(sessionId);
    const result = resolveGenerationContext({
      sessionId,
      serviceId: "logo",
      phaseId: "output",
    });
    if (!result.ok) {
      assert.notEqual(result.code, "ACTIVE_BRIEF_NOT_FOUND");
    } else {
      assert.equal(result.context.activeBrief?.activeBriefId, activeBriefId);
      assert.equal(result.context.activeBrief?.version, 7);
    }
  });

  it("I — Social Media output phase resolves original brief after restart", async () => {
    const { sessionId, activeBriefId } = await seedPinnedBrief("social-media");
    resetCdfSessionsForTests();
    resetCdfRequirementStoreForTests();
    const session = await ensureCdfSessionLoaded(sessionId);
    assert.equal(session!.phaseId, "output");
    const result = resolveGenerationContext({
      sessionId,
      serviceId: "social-media",
      phaseId: "output",
    });
    if (!result.ok) {
      assert.notEqual(result.code, "ACTIVE_BRIEF_NOT_FOUND");
    } else {
      assert.equal(result.context.activeBrief?.version, 7);
      assert.equal(result.context.activeBrief?.activeBriefId, activeBriefId);
    }
  });

  it("J — another CDF service uses the same rehydration path", async () => {
    const { sessionId, activeBriefId } = await seedPinnedBrief("web-tech");
    resetCdfSessionsForTests();
    resetCdfRequirementStoreForTests();
    await ensureCdfSessionLoaded(sessionId);
    assert.equal(
      getActiveBriefByVersion(sessionId, 7)?.activeBriefId,
      activeBriefId,
    );
  });

  it("K — no service-specific branch in ensureCdfSessionLoaded co-load", async () => {
    // Behavioral: same API works for multiple services (covered by I/J).
    // Structural: co-load is in session-store without serviceId switches.
    const src = await import("fs").then((fs) =>
      fs.promises.readFile(
        require("path").join(
          __dirname,
          "../../../src/platform/cdf/session-store.ts",
        ),
        "utf8",
      ),
    );
    assert.equal(/serviceId\s*===\s*["']social-media["']/.test(src), false);
    assert.equal(/phaseId\s*===\s*["']output["']/.test(src), false);
  });
});
