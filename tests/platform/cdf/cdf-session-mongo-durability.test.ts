/**
 * Framework CDF session durability — Mongo lifecycle (A–D + fail-closed).
 * No service-specific branches.
 */

import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  applyCdfTransition,
  compareAndSwapCdfSession,
  ensureCdfSessionLoaded,
  flushCdfSessionDurability,
  getCdfSession,
  persistCdfSession,
  persistCdfSessionCas,
  resetCdfSessionsForTests,
  resolveCdfSessionDurabilityMode,
  saveCdfSession,
} from "../../../src/platform/cdf";
import {
  loadCdfSessionFromMongo,
  persistCdfSessionToMongo,
} from "../../../src/platform/infrastructure/durability/mongo/models/cdf-session.model";
import type { CdfSessionState } from "../../../src/platform/cdf/types";

function baseSession(overrides?: Partial<CdfSessionState>): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId: `cdf_persist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    serviceId: "presentation",
    organizationId: "org_persist",
    contractVersion: "2.0.0-m1",
    sessionVersion: 1,
    status: "awaiting_brief",
    phaseIndex: -1,
    phaseId: null,
    approved: [],
    selected: [],
    masters: {},
    modeOwnership: "ai",
    productMode: "ai",
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

describe("CDF session Mongo durability (framework)", () => {
  let mongod: MongoMemoryServer;
  const prevDurability = process.env.CDF_SESSION_DURABILITY;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    process.env.CDF_SESSION_DURABILITY = "required";
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
    if (prevDurability === undefined) delete process.env.CDF_SESSION_DURABILITY;
    else process.env.CDF_SESSION_DURABILITY = prevDurability;
  });

  beforeEach(() => {
    resetCdfSessionsForTests();
  });

  it("A — new CDF session persists durably", async () => {
    const session = saveCdfSession(baseSession());
    await persistCdfSession(session);
    const fromMongo = await loadCdfSessionFromMongo(session.sessionId);
    assert.ok(fromMongo);
    assert.equal(fromMongo!.sessionId, session.sessionId);
    assert.equal(fromMongo!.sessionVersion, 1);
    assert.equal(fromMongo!.serviceId, "presentation");
  });

  it("B — CDF transition persists durable state (CAS)", async () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "presentation",
      productMode: "ai",
      organizationId: "org_persist",
    });
    assert.equal(started.ok, true);
    if (!started.ok) throw new Error("start");
    await persistCdfSession(started.value.session);

    const briefed = await persistCdfSessionCas(1, {
      ...started.value.session,
      status: "active",
      phaseId: "storyline",
      phaseIndex: 0,
      brief: "Pitch deck for Acme",
      sessionVersion: 1,
      updatedAt: new Date().toISOString(),
    });
    assert.ok(briefed);
    assert.equal(briefed!.sessionVersion, 2);

    const fromMongo = await loadCdfSessionFromMongo(started.value.session.sessionId);
    assert.ok(fromMongo);
    assert.equal(fromMongo!.sessionVersion, 2);
    assert.equal(fromMongo!.phaseId, "storyline");
  });

  it("C — persistence failure is observable (fail-closed when required)", async () => {
    assert.equal(resolveCdfSessionDurabilityMode(), "required");
    const session = saveCdfSession(baseSession());
    await mongoose.disconnect();
    await assert.rejects(
      () => persistCdfSession(session),
      /durability failed|mongo_unavailable/i,
    );
    await mongoose.connect(mongod.getUri());
  });

  it("D — rehydration reconstructs exact artifact identity", async () => {
    const session = saveCdfSession(
      baseSession({
        generatedArtifacts: [
          {
            artifactId: "cdfart_persist_routes",
            version: 1,
            phaseId: "routes",
            artifactKey: "social-media.routes",
            role: "generated",
          },
        ],
        selectedArtifacts: [
          {
            artifactId: "cdfart_persist_routes",
            version: 1,
            phaseId: "routes",
            artifactKey: "social-media.routes",
            role: "selected",
          },
        ],
      }),
    );
    await persistCdfSession(session);
    resetCdfSessionsForTests();
    assert.equal(getCdfSession(session.sessionId), undefined);

    const loaded = await ensureCdfSessionLoaded(session.sessionId);
    assert.ok(loaded);
    assert.deepEqual(loaded!.generatedArtifacts, session.generatedArtifacts);
    assert.deepEqual(loaded!.selectedArtifacts, session.selectedArtifacts);
    assert.equal(loaded!.selectedArtifacts![0]!.artifactId, "cdfart_persist_routes");
    assert.equal(loaded!.selectedArtifacts![0]!.version, 1);
  });

  it("E — generated ≠ selected ≠ approved roles preserved in snapshot", async () => {
    const session = saveCdfSession(
      baseSession({
        generatedArtifacts: [
          {
            artifactId: "cdfart_a",
            version: 1,
            phaseId: "routes",
            artifactKey: "social-media.routes",
            role: "generated",
          },
        ],
        selectedArtifacts: [
          {
            artifactId: "cdfart_a",
            version: 1,
            phaseId: "routes",
            artifactKey: "social-media.routes",
            role: "selected",
          },
        ],
        approvedArtifacts: [
          {
            artifactId: "cdfart_b",
            version: 2,
            phaseId: "output",
            artifactKey: "social-media.output",
            role: "approved",
          },
        ],
      }),
    );
    await flushCdfSessionDurability(session.sessionId);
    const fromMongo = await loadCdfSessionFromMongo(session.sessionId);
    assert.equal(fromMongo!.generatedArtifacts![0]!.role, "generated");
    assert.equal(fromMongo!.selectedArtifacts![0]!.role, "selected");
    assert.equal(fromMongo!.approvedArtifacts![0]!.role, "approved");
    assert.notEqual(
      fromMongo!.generatedArtifacts![0]!.artifactId,
      fromMongo!.approvedArtifacts![0]!.artifactId,
    );
  });

  it("F — selected X@V remains X@V when a later version exists in snapshot", async () => {
    const session = saveCdfSession(
      baseSession({
        selectedArtifacts: [
          {
            artifactId: "cdfart_pin",
            version: 1,
            phaseId: "routes",
            artifactKey: "social-media.routes",
            role: "selected",
          },
        ],
        generatedArtifacts: [
          {
            artifactId: "cdfart_pin",
            version: 2,
            phaseId: "routes",
            artifactKey: "social-media.routes",
            role: "generated",
          },
        ],
      }),
    );
    await persistCdfSession(session);
    resetCdfSessionsForTests();
    const loaded = await ensureCdfSessionLoaded(session.sessionId);
    assert.equal(loaded!.selectedArtifacts![0]!.version, 1);
    assert.equal(loaded!.generatedArtifacts![0]!.version, 2);
  });

  it("write result from model is explicit (not silent void)", async () => {
    const session = baseSession();
    const written = await persistCdfSessionToMongo(session);
    assert.equal(written.ok, true);
    if (written.ok) assert.equal(written.mode, "upsert");
  });

  it("memory CAS then flush persists without double-CAS bug", async () => {
    const session = saveCdfSession(baseSession());
    await persistCdfSession(session);
    const swapped = compareAndSwapCdfSession(session.sessionId, 1, {
      ...session,
      brief: "updated",
      updatedAt: new Date().toISOString(),
    });
    assert.ok(swapped);
    assert.equal(swapped!.sessionVersion, 2);
    await persistCdfSession(swapped!);
    const fromMongo = await loadCdfSessionFromMongo(session.sessionId);
    assert.equal(fromMongo!.sessionVersion, 2);
    assert.equal(fromMongo!.brief, "updated");
  });
});
