/**
 * Structural/OCR diagnostic persistence — observational only.
 * Acceptance remains artifact → structural verification → evaluation → canonical decision.
 * No second acceptance path; no OCR duplication; fanout leaves stay independent.
 */

import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  applyCdfCanonicalCompletionIngest,
  mergeStructuralDiagnosticStamps,
} from "../../../src/platform/api/services/execution-cdf-canonical-ingest";
import {
  buildStructuralVerificationDiagnostics,
  evaluateStructuralCompositionCompliance,
  structuralVerificationMetadataStamps,
} from "../../../src/platform/cdf/generation-validation/structural-composition-validation";
import { deriveVisualVerificationRequirements } from "../../../src/platform/cdf/generation-validation/visual-verification-requirements";
import { resolveDeliverableCompositionContract } from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  createArtifact,
  fixtureSocialMediaRoutes,
  markSelected,
  persistCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfSessionsForTests,
  saveCdfSession,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import type { CdfSessionState } from "../../../src/platform/cdf/types";
import type { AsyncMediaPlatform } from "../../../src/platform/infrastructure/durability/create-async-media-platform";
import { EnterpriseArtifact } from "../../../src/platform/infrastructure/durability/mongo/models/enterprise-artifact.model";
import { EnterpriseBlobMetadata } from "../../../src/platform/infrastructure/durability/mongo/models/enterprise-blob-metadata.model";
import {
  buildGenerationFanoutLeafMetadata,
  planImageGenerationFanout,
} from "../../../src/platform/generation/generation-fanout";
import {
  installFixtureRenderedTextProofProducer,
  uninstallFixtureRenderedTextProofProducer,
} from "./helpers/fixture-rendered-text-proof";

const ORG = "6a8d8d7dc263a4d6afe69691";
const PROJ = "proj_struct_diag";
const REQUIRED =
  "Exact required on-asset message for structural diagnostic persistence tests.";

const contract = resolveDeliverableCompositionContract("social_creative")!;
const vreqs = deriveVisualVerificationRequirements(contract)!;

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

function sessionStub(sessionId: string): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId,
    serviceId: "social-media",
    organizationId: ORG,
    projectId: PROJ,
    contractVersion: "2.0.0-m1",
    sessionVersion: 4,
    status: "active",
    brief: "Structural diagnostic brief",
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

function cmrWithRrc(text: string) {
  return {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "structured",
            name: "deliverable_composition",
            data: {
              deliverableKind: "social_creative",
              requiredRenderedCommunication: {
                active: true,
                placement: "on_asset",
                required: true,
                allRequiredResolved: true,
                unresolvedElements: [],
                surfaces: [
                  {
                    element: "primary_message_surface",
                    resolutionStatus: "resolved",
                    text,
                    provenance: "selected_semantic_direction",
                    required: true,
                    semanticClass: "required_rendered_communication",
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  };
}

describe("structural verification diagnostic persistence", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
    installFixtureRenderedTextProofProducer("BrandOnly OCR fragment");
  });

  afterEach(() => {
    uninstallFixtureRenderedTextProofProducer();
  });

  async function seedRoutes(sessionId: string) {
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
  }

  async function seedMedia(artId: string, executionId: string) {
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
      checksum: "diag",
      createdAt: new Date().toISOString(),
    });
  }

  it("A — OCR evidence is persisted/exposed after a successful OCR evaluation", () => {
    const structural = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        renderedTextProof: {
          extractedText: REQUIRED,
          source: "ocr",
          outcome: "ok",
          confidence: 0.91,
        },
        expectedRenderedTexts: [REQUIRED],
      },
      verificationRequirements: vreqs,
    });
    const diagnostics = buildStructuralVerificationDiagnostics({
      structural,
      evidence: {
        renderedTextProof: {
          extractedText: REQUIRED,
          source: "ocr",
          outcome: "ok",
          confidence: 0.91,
        },
        expectedRenderedTexts: [REQUIRED],
      },
      executionId: "exec_diag_a",
      providerId: "provider.ideogram",
      modelId: "ideogram-3",
      requiresRenderedTextProof: true,
    });
    const stamps = structuralVerificationMetadataStamps(diagnostics);
    const exposed = mergeStructuralDiagnosticStamps({
      target: { preferredProviderId: "provider.ideogram" },
      stamps,
    });

    expect(diagnostics.ocrExecuted).toBe(true);
    expect(diagnostics.ocrOutcome).toBe("ok");
    expect(diagnostics.extractedText).toBe(REQUIRED);
    expect(diagnostics.ocrConfidence).toBe(0.91);
    expect(diagnostics.expectedRenderedTexts).toEqual([REQUIRED]);
    expect(diagnostics.renderedTextPresenceVerdict).toBe("COMPLIANT");
    expect(diagnostics.renderedTextMatchVerdict).toBe("COMPLIANT");
    expect(diagnostics.blockingDecision).toBe(false);
    expect(structural.blocksCanonicalCompletion).toBe(false);
    expect(diagnostics.canonicalIngestDecision).toBe("eligible");
    expect(diagnostics.provider).toBe("provider.ideogram");
    expect(diagnostics.model).toBe("ideogram-3");
    expect(diagnostics.executionId).toBe("exec_diag_a");
    expect(diagnostics.diagnosticAuthority).toBe("observational");
    expect(exposed.cdfStructuralComplianceStatus).toBe(structural.status);
    expect(
      (exposed.cdfStructuralCompliance as { extractedText?: string })
        .extractedText,
    ).toBe(REQUIRED);
  });

  it("B — NON_COMPLIANT stamps diagnostics but does not suppress ArtifactVersion", async () => {
    const sessionId = `cdf_diag_b_${Date.now().toString(36)}`;
    const executionId = `exec_diag_b_${Date.now()}`;
    const artId = `art_diag_b_${Date.now()}_0`;
    await seedRoutes(sessionId);
    await seedMedia(artId, executionId);

    const meta: Record<string, unknown> = {
      cdfSessionId: sessionId,
      cdfPhaseId: "output",
      cdfServiceId: "social-media",
      cdfExecutionStrategy: "canonical",
      cdfArtifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      cdfGenerationModality: "image",
      preferredProviderId: "provider.ideogram",
      preferredModelId: "ideogram-3",
      canonicalModelRequest: cmrWithRrc(REQUIRED),
    };

    const ingest = await applyCdfCanonicalCompletionIngest({
      status: "succeeded",
      workingMetadata: meta,
      structuredCandidate: { routes: [{ name: "stale" }] },
      mediaArtifactIds: [artId],
      executionId,
      organizationId: ORG,
      projectId: PROJ,
      asyncMedia: fakeAsyncMedia(),
      logOsExecutionEvent: () => undefined,
    });

    // Structural NON_COMPLIANT is a quality plane — must not alone block product.
    assert.equal(ingest.productCompletionBlocked, false);
    assert.ok(ingest.metadataStamps);
    const compliance = ingest.metadataStamps!
      .cdfStructuralCompliance as Record<string, unknown>;
    expect(compliance.ocrExecuted).toBe(true);
    expect(compliance.extractedText).toBe("BrandOnly OCR fragment");
    expect(compliance.expectedRenderedTexts).toEqual([REQUIRED]);
    expect(compliance.renderedTextMatchVerdict).toBe("NON_COMPLIANT");
    expect(compliance.overallStructuralVerdict).toBe("NON_COMPLIANT");
    // Diagnostic stamp may still record blockingDecision for verification plane.
    expect(compliance.blockingDecision).toBe(true);
    expect(compliance.failedRequirementIds).toEqual(
      expect.arrayContaining(["rendered_text_match"]),
    );
    expect(compliance.provider).toBe("provider.ideogram");
    expect(compliance.model).toBe("ideogram-3");
    expect(compliance.executionId).toBe(executionId);
    expect(meta.cdfStructuralComplianceStatus).toBe("NON_COMPLIANT");
    // NON_COMPLIANT is never rewritten as COMPLIANT.
    expect(meta.cdfStructuralComplianceStatus).not.toBe("COMPLIANT");
  });

  it("C — persisted diagnostics do not independently authorize completion", async () => {
    const sessionId = `cdf_diag_c_${Date.now().toString(36)}`;
    const executionId = `exec_diag_c_${Date.now()}`;
    const artId = `art_diag_c_${Date.now()}_0`;
    await seedRoutes(sessionId);
    await seedMedia(artId, executionId);

    const fakeCompliant = buildStructuralVerificationDiagnostics({
      structural: evaluateStructuralCompositionCompliance({
        contract,
        evidence: {
          renderedTextProof: {
            extractedText: REQUIRED,
            source: "ocr",
            outcome: "ok",
          },
          expectedRenderedTexts: [REQUIRED],
        },
        verificationRequirements: vreqs,
      }),
      evidence: {
        renderedTextProof: {
          extractedText: REQUIRED,
          source: "ocr",
          outcome: "ok",
        },
        expectedRenderedTexts: [REQUIRED],
      },
      executionId,
      providerId: "provider.openai",
      modelId: "gpt-image-2",
    });
    expect(fakeCompliant.canonicalIngestDecision).toBe("eligible");

    const meta: Record<string, unknown> = {
      cdfSessionId: sessionId,
      cdfPhaseId: "output",
      cdfServiceId: "social-media",
      cdfExecutionStrategy: "canonical",
      cdfArtifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      cdfGenerationModality: "image",
      // Pre-seed observational-looking COMPLIANT stamps — must not authorize.
      ...structuralVerificationMetadataStamps(fakeCompliant),
      canonicalModelRequest: cmrWithRrc(REQUIRED),
    };

    const ingest = await applyCdfCanonicalCompletionIngest({
      status: "succeeded",
      workingMetadata: meta,
      structuredCandidate: null,
      mediaArtifactIds: [artId],
      executionId,
      organizationId: ORG,
      projectId: PROJ,
      asyncMedia: fakeAsyncMedia(),
      logOsExecutionEvent: () => undefined,
    });

    // Observational pre-stamps do not authorize; live evaluation still runs.
    // Structural NON_COMPLIANT no longer alone sets productCompletionBlocked —
    // but diagnostics must reflect the live evaluation, not the pre-seed.
    assert.ok(ingest.metadataStamps);
    const compliance = ingest.metadataStamps!
      .cdfStructuralCompliance as Record<string, unknown>;
    expect(compliance.diagnosticAuthority).toBe("observational");
    expect(compliance.overallStructuralVerdict).toBe("NON_COMPLIANT");
    expect(compliance.blockingDecision).toBe(true);
    // Merge helper is observational — does not flip hard product flags.
    const merged = mergeStructuralDiagnosticStamps({
      target: {
        productCompletionBlocked: true,
        cdfFallbackReason: "structural_compliance_failed",
      },
      stamps: structuralVerificationMetadataStamps(fakeCompliant),
    });
    expect(merged.productCompletionBlocked).toBe(true);
    expect(merged.cdfFallbackReason).toBe("structural_compliance_failed");
  });

  it("D — provider failure produces no fabricated OCR evidence", async () => {
    const sessionId = `cdf_diag_d_${Date.now().toString(36)}`;
    saveCdfSession(sessionStub(sessionId));
    await persistCdfSession(sessionStub(sessionId));

    const meta: Record<string, unknown> = {
      cdfSessionId: sessionId,
      cdfPhaseId: "output",
      cdfServiceId: "social-media",
      cdfExecutionStrategy: "canonical",
      cdfArtifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      cdfGenerationModality: "image",
      preferredProviderId: "provider.openai",
      preferredModelId: "gpt-image-2",
    };

    const ingest = await applyCdfCanonicalCompletionIngest({
      status: "failed",
      workingMetadata: meta,
      structuredCandidate: null,
      mediaArtifactIds: [],
      executionId: "exec_diag_d_provider_fail",
      organizationId: ORG,
      projectId: PROJ,
      asyncMedia: fakeAsyncMedia(),
      logOsExecutionEvent: () => undefined,
    });

    expect(ingest.metadataStamps).toBeUndefined();
    expect(meta.cdfStructuralCompliance).toBeUndefined();
    expect(meta.cdfStructuralComplianceStatus).toBeUndefined();
    expect(ingest.productCompletionBlocked).toBe(false);
  });

  it("E — fanout leaves remain independent for diagnostic stamps", () => {
    const plan = planImageGenerationFanout({
      useCase: "marketing_creative",
      groupId: "fanout_diag_e",
      executableProviderIds: new Set([
        "provider.openai",
        "provider.google",
        "provider.ideogram",
      ]),
    });
    expect(plan.targets.length).toBeGreaterThanOrEqual(2);

    const leafA = buildGenerationFanoutLeafMetadata({
      plan,
      target: plan.targets[0]!,
    });
    const leafB = buildGenerationFanoutLeafMetadata({
      plan,
      target: plan.targets[1]!,
    });

    const structuralA = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        renderedTextProof: {
          extractedText: REQUIRED,
          source: "ocr",
          outcome: "ok",
        },
        expectedRenderedTexts: [REQUIRED],
      },
      verificationRequirements: vreqs,
    });
    const structuralB = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        renderedTextProof: {
          extractedText: "unrelated brand mark",
          source: "ocr",
          outcome: "ok",
        },
        expectedRenderedTexts: [REQUIRED],
      },
      verificationRequirements: vreqs,
    });

    const stampsA = structuralVerificationMetadataStamps(
      buildStructuralVerificationDiagnostics({
        structural: structuralA,
        evidence: {
          renderedTextProof: {
            extractedText: REQUIRED,
            source: "ocr",
            outcome: "ok",
          },
          expectedRenderedTexts: [REQUIRED],
        },
        executionId: "exec_leaf_a",
        providerId: leafA.preferredProviderId,
        modelId: leafA.preferredModelId,
      }),
    );
    const stampsB = structuralVerificationMetadataStamps(
      buildStructuralVerificationDiagnostics({
        structural: structuralB,
        evidence: {
          renderedTextProof: {
            extractedText: "unrelated brand mark",
            source: "ocr",
            outcome: "ok",
          },
          expectedRenderedTexts: [REQUIRED],
        },
        executionId: "exec_leaf_b",
        providerId: leafB.preferredProviderId,
        modelId: leafB.preferredModelId,
      }),
    );

    const metaA = mergeStructuralDiagnosticStamps({
      target: { ...leafA },
      stamps: stampsA,
    });
    const metaB = mergeStructuralDiagnosticStamps({
      target: { ...leafB },
      stamps: stampsB,
    });

    expect(`${metaA.preferredProviderId}::${metaA.preferredModelId}`).not.toBe(
      `${metaB.preferredProviderId}::${metaB.preferredModelId}`,
    );
    expect(
      (metaA.cdfStructuralCompliance as { executionId: string }).executionId,
    ).toBe("exec_leaf_a");
    expect(
      (metaB.cdfStructuralCompliance as { executionId: string }).executionId,
    ).toBe("exec_leaf_b");
    expect(structuralA.blocksCanonicalCompletion).toBe(false);
    expect(structuralB.blocksCanonicalCompletion).toBe(true);
    expect(
      (metaA.cdfStructuralCompliance as { blockingDecision: boolean })
        .blockingDecision,
    ).toBe(false);
    expect(
      (metaB.cdfStructuralCompliance as { blockingDecision: boolean })
        .blockingDecision,
    ).toBe(true);
    expect(
      (metaB.cdfStructuralCompliance as { renderedTextMatchVerdict: string })
        .renderedTextMatchVerdict,
    ).toBe("NON_COMPLIANT");
    // Declared intra-leaf fallback (resolveIntraLeafFailoverChain): same
    // provider only, never a sibling target's model, never the leaf primary.
    const siblingKeys = new Set(
      plan.targets.map((t) => `${t.providerId}::${t.modelId}`),
    );
    for (const meta of [metaA, metaB]) {
      const chain = meta.imageFailoverChain as {
        providerId: string;
        modelId: string;
      }[];
      for (const step of chain) {
        expect(step.providerId).toBe(meta.preferredProviderId);
        expect(siblingKeys.has(`${step.providerId}::${step.modelId}`)).toBe(
          false,
        );
      }
    }
    expect(metaA.disableCrossProviderFailover).toBe(true);
    expect(metaB.disableCrossProviderFailover).toBe(true);
    // Replacing leaf A stamps must not alter leaf B object identity/content.
    metaA.cdfStructuralCompliance = { mutated: true };
    expect(
      (metaB.cdfStructuralCompliance as { extractedText: string }).extractedText,
    ).toBe("unrelated brand mark");
  });
});
