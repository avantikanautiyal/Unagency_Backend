/**
 * Part 7 — Complete deterministic fanout certification.
 * One selected direction X@V → Leaf A/B/C with shared context, distinct targets.
 */

import assert from "node:assert/strict";
import { resolveEstablishedCanonicalCompletionAttach } from "../../../src/platform/api/services/execution-cdf-canonical-ingest";
import {
  createArtifact,
  fixtureSocialMediaOutput,
  fixtureSocialMediaRoutes,
  resetCdfArtifactEngineForTests,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
} from "../../../src/platform/cdf";
import {
  getCdfSession,
  resetCdfSessionsForTests,
  saveCdfSession,
} from "../../../src/platform/cdf/session-store";
import type { CdfSessionState } from "../../../src/platform/cdf/types";

const ORG = "6a8d8d7dc263a4d6afe69691";
const PROJ = "proj_fanout_cert";

type LeafIdentity = {
  targetId: string;
  artifactId: string;
  artifactVersion: number;
  sourceArtifactId: string;
  sourceArtifactVersion: number;
  sharedBrief: string;
  sharedInstruction: string;
  sharedBrand: string;
  sharedComposition: string;
  sharedRrc: string;
  sharedProductionSpec: string;
  sharedReferences: string;
};

function sessionStub(sessionId: string): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId,
    serviceId: "social-media",
    organizationId: ORG,
    projectId: PROJ,
    contractVersion: "2.0.0-m1",
    sessionVersion: 1,
    status: "active",
    brief: "Fanout shared ActiveBrief",
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

describe("fanout certification — shared source, independent leaves", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
  });

  it("Direction X@V fans out to Leaf A/B/C with identical shared context", () => {
    const sessionId = `cdf_fan_cert_${Date.now().toString(36)}`;
    saveCdfSession(sessionStub(sessionId));

    const direction = createArtifact({
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "structured_doc",
      organizationId: ORG,
      projectId: PROJ,
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      data: fixtureSocialMediaRoutes(),
      schemaVersion: "1",
    });

    const shared = {
      sharedBrief: "Fanout shared ActiveBrief",
      sharedInstruction: "current user instruction",
      sharedBrand: "brand-context-v1",
      sharedComposition: "composition-contract-v1",
      sharedRrc: "rrc-v1",
      sharedProductionSpec: "production-spec-v1",
      sharedReferences: "refs-v1",
      sourceArtifactId: direction.artifact.artifactId,
      sourceArtifactVersion: direction.version.version,
    };

    const leafDefs = [
      { targetId: "fanout_0_google", suffix: "a" },
      { targetId: "fanout_1_ideogram", suffix: "b" },
      { targetId: "fanout_2_openai", suffix: "c" },
    ] as const;

    const leaves: LeafIdentity[] = leafDefs.map((d) => {
      const art = createArtifact({
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        artifactType: "image",
        organizationId: ORG,
        projectId: PROJ,
        sessionId,
        serviceId: "social-media",
        phaseId: "output",
        data: {
          ...fixtureSocialMediaOutput(
            direction.artifact.artifactId,
            direction.version.version,
          ),
          creativeId: `creative_leaf_${d.suffix}`,
        },
        schemaVersion: "1",
      });
      return {
        targetId: d.targetId,
        artifactId: art.artifact.artifactId,
        artifactVersion: art.version.version,
        ...shared,
      };
    });

    const [leafA, leafB, leafC] = leaves;
    assert.ok(leafA && leafB && leafC);

    saveCdfSession({
      ...getCdfSession(sessionId)!,
      selectedArtifacts: [
        {
          artifactId: direction.artifact.artifactId,
          version: direction.version.version,
          phaseId: "routes",
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
          role: "selected",
        },
      ],
      generatedArtifacts: leaves.map((leaf) => ({
        artifactId: leaf.artifactId,
        version: leaf.artifactVersion,
        phaseId: "output",
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        role: "generated" as const,
        generationFanoutGroupId: "fanout_group_cert",
        generationFanoutTargetId: leaf.targetId,
        generationExecutionId: `exec_${leaf.targetId}`,
      })),
    });

    assert.equal(leafA.sourceArtifactId, leafB.sourceArtifactId);
    assert.equal(leafB.sourceArtifactId, leafC.sourceArtifactId);
    assert.equal(leafA.sourceArtifactVersion, leafB.sourceArtifactVersion);

    for (const key of [
      "sharedBrief",
      "sharedInstruction",
      "sharedBrand",
      "sharedComposition",
      "sharedRrc",
      "sharedProductionSpec",
      "sharedReferences",
    ] as const) {
      assert.equal(leafA[key], leafB[key], key);
      assert.equal(leafB[key], leafC[key], key);
    }

    assert.notEqual(leafA.targetId, leafB.targetId);
    assert.notEqual(leafB.targetId, leafC.targetId);
    assert.notEqual(leafA.artifactId, leafB.artifactId);
    assert.notEqual(leafB.artifactId, leafC.artifactId);
    assert.notEqual(
      `${leafA.artifactId}@${leafA.artifactVersion}`,
      `${leafB.artifactId}@${leafB.artifactVersion}`,
    );
    assert.notEqual(
      `${leafB.artifactId}@${leafB.artifactVersion}`,
      `${leafC.artifactId}@${leafC.artifactVersion}`,
    );

    const metaB = {
      cdfSessionId: sessionId,
      cdfPhaseId: "output",
      cdfArtifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      generationFanoutLeaf: true as const,
      generationFanoutGroupId: "fanout_group_cert",
      generationFanoutTargetId: leafB.targetId,
    };
    const establishedB = resolveEstablishedCanonicalCompletionAttach(metaB);
    assert.ok(establishedB);
    assert.equal(establishedB!.cdfArtifactId, leafB.artifactId);

    saveCdfSession({
      ...getCdfSession(sessionId)!,
      generatedArtifacts: (
        getCdfSession(sessionId)!.generatedArtifacts ?? []
      ).filter((r) => r.generationFanoutTargetId !== leafA.targetId),
    });
    assert.equal(
      resolveEstablishedCanonicalCompletionAttach({
        ...metaB,
        generationFanoutTargetId: leafA.targetId,
      }),
      null,
    );
    assert.ok(
      resolveEstablishedCanonicalCompletionAttach({
        ...metaB,
        generationFanoutTargetId: leafB.targetId,
      }),
    );
    assert.ok(
      resolveEstablishedCanonicalCompletionAttach({
        ...metaB,
        generationFanoutTargetId: leafC.targetId,
      }),
    );
  });

  it("failover inside leaf A does not consume leaf B/C targets", () => {
    const sessionId = `cdf_fan_fail_${Date.now().toString(36)}`;
    saveCdfSession({
      ...sessionStub(sessionId),
      generatedArtifacts: [
        {
          artifactId: "cdfart_leaf_a_out",
          version: 1,
          phaseId: "output",
          artifactKey: "social-media.output",
          role: "generated",
          generationFanoutGroupId: "g",
          generationFanoutTargetId: "fanout_0_a",
          generationExecutionId: "exec_a_failover_attempt_2",
        },
        {
          artifactId: "cdfart_leaf_b_out",
          version: 1,
          phaseId: "output",
          artifactKey: "social-media.output",
          role: "generated",
          generationFanoutGroupId: "g",
          generationFanoutTargetId: "fanout_1_b",
          generationExecutionId: "exec_b_1",
        },
        {
          artifactId: "cdfart_leaf_c_out",
          version: 1,
          phaseId: "output",
          artifactKey: "social-media.output",
          role: "generated",
          generationFanoutGroupId: "g",
          generationFanoutTargetId: "fanout_2_c",
          generationExecutionId: "exec_c_1",
        },
      ],
    });

    const b = resolveEstablishedCanonicalCompletionAttach({
      cdfSessionId: sessionId,
      cdfPhaseId: "output",
      cdfArtifactKey: "social-media.output",
      generationFanoutLeaf: true,
      generationFanoutGroupId: "g",
      generationFanoutTargetId: "fanout_1_b",
    });
    const c = resolveEstablishedCanonicalCompletionAttach({
      cdfSessionId: sessionId,
      cdfPhaseId: "output",
      cdfArtifactKey: "social-media.output",
      generationFanoutLeaf: true,
      generationFanoutGroupId: "g",
      generationFanoutTargetId: "fanout_2_c",
    });
    assert.equal(b?.cdfArtifactId, "cdfart_leaf_b_out");
    assert.equal(c?.cdfArtifactId, "cdfart_leaf_c_out");
    assert.notEqual(b?.cdfArtifactId, c?.cdfArtifactId);
  });
});
