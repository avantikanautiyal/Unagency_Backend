/**
 * Contract-driven completion candidate class:
 * text/structured → structured candidate
 * image/video/hybrid + media → media wins over text envelope
 */

import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  contractRequiresMediaCompletionCandidate,
  isDiagnosticTextEnvelope,
  resolveStructuredCompletionCandidate,
} from "../../../src/platform/api/services/execution-structured-completion-candidate";
import { applyCdfCanonicalCompletionIngest } from "../../../src/platform/api/services/execution-cdf-canonical-ingest";
import {
  contractRequiresCanonicalImageIngest,
  createArtifact,
  fixtureSocialMediaRoutes,
  getCdfSession,
  markSelected,
  persistCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfSessionsForTests,
  saveCdfSession,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";
import type { CdfSessionState } from "../../../src/platform/cdf/types";
import type { AsyncMediaPlatform } from "../../../src/platform/infrastructure/durability/create-async-media-platform";
import { EnterpriseArtifact } from "../../../src/platform/infrastructure/durability/mongo/models/enterprise-artifact.model";
import { EnterpriseBlobMetadata } from "../../../src/platform/infrastructure/durability/mongo/models/enterprise-blob-metadata.model";
import {
  installFixtureRenderedTextProofProducer,
  uninstallFixtureRenderedTextProofProducer,
} from "./helpers/fixture-rendered-text-proof";

const ORG = "6a8d8d7dc263a4d6afe69691";
const PROJ = "proj_cand_media";

function routesMeta(): Record<string, unknown> {
  return {
    cdfSessionId: "cdf_cand_routes",
    cdfPhaseId: "routes",
    cdfServiceId: "social-media",
    cdfExecutionStrategy: "canonical",
    cdfArtifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    cdfGenerationModality: "text",
  };
}

function outputMeta(sessionId: string): Record<string, unknown> {
  return {
    cdfSessionId: sessionId,
    cdfPhaseId: "output",
    cdfServiceId: "social-media",
    cdfExecutionStrategy: "canonical",
    cdfArtifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    cdfGenerationModality: "image",
    productAction: "generate",
    cdfExecutionAuthorityApplied: true,
    cdfAuthorityOutputKind: "image",
  };
}

function sessionStub(sessionId: string): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId,
    serviceId: "social-media",
    organizationId: ORG,
    projectId: PROJ,
    contractVersion: "2.0.0-m1",
    sessionVersion: 5,
    status: "active",
    brief: "Media candidate brief",
    phaseIndex: 3,
    phaseId: "output",
    approved: [],
    selected: [],
    masters: {},
    modeOwnership: "ai",
    productMode: "ai",
    createdAt: ts,
    updatedAt: ts,
  };
}

function fakeAsyncMedia(): AsyncMediaPlatform {
  return {
    artifacts: { finalized: new Map() },
    blobMetadata: {
      async resolveForTenant() {
        return undefined;
      },
      async get() {
        return undefined;
      },
      async register() {},
    },
  } as unknown as AsyncMediaPlatform;
}

describe("CDF completion candidate class (modality authority)", () => {
  it("1 — canonical text phase + structured → structured candidate", () => {
    const routes = resolveCdfPhaseExecutionContract({
      serviceId: "social-media",
      phaseId: "routes",
    });
    assert.ok(routes);
    assert.equal(contractRequiresMediaCompletionCandidate(routes), false);

    const resolved = resolveStructuredCompletionCandidate({
      result: { kind: "text", text: "ignore" },
      jobSummary: {
        structuredData: {
          routes: [{ name: "A", creativeIdea: "x" }],
        },
      },
      metadata: routesMeta(),
    });
    assert.equal(resolved.source, "job_summary.structuredData");
    assert.ok(
      Array.isArray((resolved.candidate as { routes: unknown[] }).routes),
    );
  });

  it("2 — canonical image phase + media + text → media_required (not text_envelope)", () => {
    const output = resolveCdfPhaseExecutionContract({
      serviceId: "social-media",
      phaseId: "output",
    });
    assert.ok(output);
    assert.equal(output!.generationModality, "image");
    assert.equal(contractRequiresMediaCompletionCandidate(output), true);
    assert.ok(contractRequiresCanonicalImageIngest(outputMeta("cdf_x")));

    const resolved = resolveStructuredCompletionCandidate({
      result: {
        kind: "text",
        text: "A beautiful social creative was generated.",
      },
      jobSummary: {
        resultText: "A beautiful social creative was generated.",
        mediaPresent: true,
        artifactIds: ["art_syncimg_55_1789313537288_0"],
      },
      metadata: outputMeta("cdf_x"),
    });
    assert.equal(resolved.source, "media_required_for_contract");
    assert.equal(resolved.candidate, null);
    assert.equal(resolved.structuredPresent, false);
  });

  it("5 — text envelope cannot satisfy an image canonical contract", () => {
    assert.equal(isDiagnosticTextEnvelope({ text: "provider caption" }), true);
    const resolved = resolveStructuredCompletionCandidate({
      result: { kind: "text", text: "provider caption" },
      metadata: outputMeta("cdf_y"),
    });
    assert.notEqual(resolved.source, "execution_result.text_envelope");
    assert.equal(resolved.candidate, null);
  });

  it("matrix — video/hybrid require media; text/route_visual do not", () => {
    assert.equal(
      contractRequiresMediaCompletionCandidate({
        executionStrategy: "canonical",
        generationModality: "video",
      }),
      true,
    );
    assert.equal(
      contractRequiresMediaCompletionCandidate({
        executionStrategy: "canonical",
        generationModality: "hybrid",
      }),
      true,
    );
    assert.equal(
      contractRequiresMediaCompletionCandidate({
        executionStrategy: "canonical",
        generationModality: "text",
      }),
      false,
    );
    assert.equal(
      contractRequiresMediaCompletionCandidate({
        executionStrategy: "route_visual",
        generationModality: "image",
      }),
      false,
    );
  });

  it("7 — provider identity does not change candidate class", () => {
    const withFailoverMeta = {
      ...outputMeta("cdf_failover"),
      selectedProviderId: "provider.openai",
      actualProviderId: "provider.ideogram",
      fallbackUsed: true,
    };
    const resolved = resolveStructuredCompletionCandidate({
      result: { kind: "text", text: "caption" },
      metadata: withFailoverMeta,
    });
    assert.equal(resolved.source, "media_required_for_contract");
  });

  it("10 — no service/phase id branches in candidate module", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/api/services/execution-structured-completion-candidate.ts",
      ),
      "utf8",
    );
    assert.equal(/serviceId\s*===\s*["']social-media["']/.test(src), false);
    assert.equal(/phaseId\s*===\s*["']output["']/.test(src), false);
  });
});

describe("CDF image ingest: media over text envelope (end-to-end)", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
    installFixtureRenderedTextProofProducer();
  });

  afterEach(() => {
    uninstallFixtureRenderedTextProofProducer();
  });

  async function seedRoutesSelected(sessionId: string) {
    const created = createArtifact({
      organizationId: ORG,
      projectId: PROJ,
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
    markSelected(created.artifact.artifactId, 1);
    let session = saveCdfSession(sessionStub(sessionId));
    session = upsertSessionArtifactRef(session, {
      artifactId: created.artifact.artifactId,
      version: 1,
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      role: "selected",
    });
    saveCdfSession(session);
    await persistCdfSession(session);
    return created;
  }

  async function seedExecutionMedia(artId: string, executionId: string) {
    const storageKey = `tenant/test/executions/${executionId}/artifacts/${artId}/output-0.png`;
    await EnterpriseArtifact.create({
      artifactId: artId,
      executionId,
      organizationId: ORG,
      kind: "media",
      label: `blob:${storageKey}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await EnterpriseBlobMetadata.create({
      storageKey,
      organizationId: ORG,
      artifactId: artId,
      mimeType: "image/png",
      sizeBytes: 128,
      checksum: "abc",
      createdAt: new Date().toISOString(),
    });
  }

  it("3/6 — text envelope + art_* → cdfart_* output (art_* not identity)", async () => {
    const sessionId = `cdf_cand_out_${Date.now().toString(36)}`;
    const executionId = `exec_cand_${Date.now()}`;
    const artId = `art_syncimg_cand_${Date.now()}_0`;
    await seedRoutesSelected(sessionId);
    await seedExecutionMedia(artId, executionId);

    // Pre-fix shape: text envelope already present as structuredCandidate.
    const ingest = await applyCdfCanonicalCompletionIngest({
      status: "succeeded",
      workingMetadata: outputMeta(sessionId),
      structuredCandidate: {
        text: "A beautiful social creative was generated.",
      },
      mediaArtifactIds: [artId],
      executionId,
      organizationId: ORG,
      projectId: PROJ,
      asyncMedia: fakeAsyncMedia(),
      logOsExecutionEvent: () => undefined,
    });

    assert.equal(ingest.productCompletionBlocked, false);
    assert.ok(ingest.socialMediaCanonicalAttach);
    const attach = ingest.socialMediaCanonicalAttach!;
    assert.equal(attach.cdfArtifactKey, SOCIAL_MEDIA_ARTIFACT_KEYS.output);
    assert.match(String(attach.cdfArtifactId), /^cdfart_/);
    assert.ok(!String(attach.cdfArtifactId).startsWith("art_"));

    const session = getCdfSession(sessionId)!;
    const pin = session.generatedArtifacts?.find(
      (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    );
    assert.ok(pin);
    assert.equal(pin!.artifactId, attach.cdfArtifactId);
    assert.equal(pin!.version, attach.cdfArtifactVersion);
  });

  it("4 — image contract with no media fails closed", async () => {
    const sessionId = `cdf_cand_nomedia_${Date.now().toString(36)}`;
    await seedRoutesSelected(sessionId);

    const resolved = resolveStructuredCompletionCandidate({
      result: { kind: "text", text: "no image" },
      metadata: outputMeta(sessionId),
    });
    assert.equal(resolved.source, "media_required_for_contract");

    const ingest = await applyCdfCanonicalCompletionIngest({
      status: "succeeded",
      workingMetadata: outputMeta(sessionId),
      structuredCandidate: resolved.candidate,
      mediaArtifactIds: [],
      executionId: "exec_cand_fail",
      organizationId: ORG,
      projectId: PROJ,
      logOsExecutionEvent: () => undefined,
    });
    assert.equal(ingest.productCompletionBlocked, true);
    assert.equal(ingest.socialMediaCanonicalAttach, null);
  });
});
