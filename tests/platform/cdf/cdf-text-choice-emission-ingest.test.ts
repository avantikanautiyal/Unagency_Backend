/**
 * Canonical text_choice emission → ingest → ArtifactVersion → generatedArtifacts.
 *
 * Guards the real HTTP defect:
 *   prose markdown routes → social_canonicalization_unsupported
 * must become:
 *   emission schema → structured routes[] → accept → X@V pin
 */

import assert from "node:assert/strict";
import {
  applyCdfTransition,
  bindGeneratedSocialMediaArtifactToSession,
  bindSocialMediaGeneratedFromAttach,
  createArtifact,
  fixtureSocialMediaPlatform,
  fixtureSocialMediaSizeReference,
  getArtifactVersion,
  getCdfSession,
  normalizeToSocialMediaData,
  classifySocialMediaProviderOutput,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  stampCanonicalStructuredOutputMetadata,
  assertCanonicalStructuredSchemaBeforeProvider,
  requiresCanonicalEmissionSchema,
  requiresCanonicalStructuredSchema,
  tryIngestSocialMediaCdfCompletion,
} from "../../../src/platform/cdf";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";
import { asOrganizationId } from "../../../src/platform/core/identifiers";
import { createDirectExecutionEngine } from "../../../src/platform/direct/direct-execution-engine";
import { createProviderRuntime } from "../../../src/platform/providers/runtime/factories/create-provider-runtime";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import { createToolRuntimePlatform } from "../../../src/platform/providers/tools/composition/tool-runtime-platform";
import { InMemoryToolInvocationStore } from "../../../src/platform/providers/tools/idempotency/in-memory-tool-invocation-store";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";

const ORG = "org_text_choice_emission";
const PROJ = "proj_text_choice_emission";

const validRoutesPayload = {
  routes: [
    {
      name: "Everyday Energy",
      creativeIdea: "Bright splash",
      visualTreatment: "High-key",
      headlineAngle: "Energy that fits Tuesday",
      rationale: "Fits everyday energy brief",
    },
    {
      name: "Quiet Power",
      creativeIdea: "Soft gradient",
      visualTreatment: "Muted",
      headlineAngle: "Steady fuel",
      rationale: "Calm confidence",
    },
    {
      name: "Playful Burst",
      creativeIdea: "Fruit confetti",
      visualTreatment: "Max color",
      headlineAngle: "Sip the spark",
      rationale: "Youthful joy",
    },
  ],
};

const proseEnvelope = {
  kind: "text",
  text: "# Three Creative Directions\n\n## Direction 1: The 3PM Lifeline\n...",
};

class SchemaAwareDispatcher extends ControllableDispatcher {
  readonly captured: ProviderExecutionRequest[] = [];
  constructor(
    private readonly structuredPayload: Record<string, unknown> | null,
  ) {
    super({ mode: "success" });
  }
  override async dispatch(
    request: ProviderExecutionRequest,
    token: Parameters<ControllableDispatcher["dispatch"]>[1],
  ) {
    this.captured.push(request);
    const so = request.metadata?.structuredOutput as
      | { name?: string; schema?: unknown }
      | undefined;
    const hasSchema =
      so != null && typeof so === "object" && so.schema != null;
    if (!hasSchema) {
      // Simulate prior defect: free-text when no emission schema
      return {
        ok: true as const,
        value: {
          ...(await super.dispatch(request, token)).value,
          response: {
            output: proseEnvelope,
          },
        },
      } as never;
    }
    const base = await super.dispatch(request, token);
    if (!base.ok) return base;
    return {
      ok: true as const,
      value: {
        ...base.value,
        response: {
          output: {
            structured: this.structuredPayload ?? validRoutesPayload,
            structuredOutputValid: true,
          },
        },
      },
    };
  }
}

function startSocialToRoutes() {
  const started = applyCdfTransition({
    action: "start",
    serviceId: "social-media",
    productMode: "ai",
    organizationId: ORG,
    projectId: PROJ,
  });
  assert.equal(started.ok, true);
  if (!started.ok) throw new Error("start");
  let session = started.value.session;
  const briefed = applyCdfTransition({
    sessionId: session.sessionId,
    action: "submit_brief",
    brief: "Mango Pulse Instagram Feed Post — everyday energy.",
    expectedVersion: session.sessionVersion,
  });
  assert.equal(briefed.ok, true);
  if (!briefed.ok) throw new Error("brief");
  session = briefed.value.session;

  for (const phaseId of ["platform", "size-reference"] as const) {
    const key =
      phaseId === "platform"
        ? SOCIAL_MEDIA_ARTIFACT_KEYS.platform
        : SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference;
    const data =
      phaseId === "platform"
        ? fixtureSocialMediaPlatform()
        : fixtureSocialMediaSizeReference();
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId,
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: key,
      artifactType: "config_choice",
      data: data as never,
    });
    assert.equal(
      bindGeneratedSocialMediaArtifactToSession({
        sessionId: session.sessionId,
        phaseId,
        artifactId: created.artifact.artifactId,
        version: 1,
        artifactKey: key,
        expectedVersion: getCdfSession(session.sessionId)!.sessionVersion,
      }).ok,
      true,
    );
    const selected = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 0,
      routeLabel: phaseId === "platform" ? "Instagram" : "Feed Post",
      expectedVersion: getCdfSession(session.sessionId)!.sessionVersion,
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: key,
    });
    assert.equal(selected.ok, true);
    if (!selected.ok) throw new Error(selected.error.message);
    session = selected.value.session;
  }
  assert.equal(session.phaseId, "routes");
  return session;
}

describe("CDF text_choice emission → ingest (framework)", () => {
  const prevIngest = process.env.CDF_SOCIAL_MEDIA_INGEST;

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    process.env.CDF_SOCIAL_MEDIA_INGEST = "true";
  });

  afterAll(() => {
    if (prevIngest === undefined) delete process.env.CDF_SOCIAL_MEDIA_INGEST;
    else process.env.CDF_SOCIAL_MEDIA_INGEST = prevIngest;
  });

  it("contract: social-media.routes requires emission schema (text_choice), not structured-only", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "social-media",
      phaseId: "routes",
    });
    assert.ok(contract);
    assert.equal(contract!.semanticRole, "text_choice");
    assert.equal(contract!.generationModality, "text");
    assert.equal(contract!.executionStrategy, "canonical");
    assert.equal(requiresCanonicalStructuredSchema(contract!), false);
    assert.equal(requiresCanonicalEmissionSchema(contract!), true);
  });

  it("A — valid structured routes: stamp → ingest → ArtifactVersion → generatedArtifacts X@V", () => {
    const session = startSocialToRoutes();
    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfSessionId: session.sessionId,
      cdfServiceId: "social-media",
      cdfPhaseId: "routes",
      cdfArtifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      service: "social",
      cdfOmitStructuredOutput: true,
    });
    assert.equal(
      (stamped.structuredOutput as { name?: string }).name,
      "CdfSocialMediaRoutes",
    );
    assert.equal(assertCanonicalStructuredSchemaBeforeProvider(stamped).ok, true);

    assert.equal(
      classifySocialMediaProviderOutput(
        SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        validRoutesPayload,
      ),
      "canonical_capable",
    );
    const normalized = normalizeToSocialMediaData(
      SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      validRoutesPayload,
    );
    assert.ok(Array.isArray(normalized.routes));
    assert.equal((normalized.routes as unknown[]).length, 3);

    const ingested = tryIngestSocialMediaCdfCompletion({
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "social-media",
        cdfPhaseId: "routes",
      },
      rawOutput: validRoutesPayload,
      executionId: "exec_text_choice_a",
      organizationId: ORG,
      projectId: PROJ,
      forceOptIn: true,
    });
    assert.ok(ingested && ingested.kind === "accepted");
    if (!ingested || ingested.kind !== "accepted") throw new Error("ingest");
    const X = ingested.attach.cdfArtifactId;
    const V = ingested.attach.cdfArtifactVersion;
    assert.ok(getArtifactVersion(X, V, { organizationId: ORG, projectId: PROJ }));

    const bound = bindSocialMediaGeneratedFromAttach({
      sessionId: session.sessionId,
      phaseId: "routes",
      attach: ingested.attach,
      organizationId: ORG,
      projectId: PROJ,
    });
    assert.equal(bound.ok, true);
    const gen = getCdfSession(session.sessionId)!.generatedArtifacts?.find(
      (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    );
    assert.deepEqual(gen, {
      artifactId: X,
      version: V,
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      role: "generated",
    });
  });

  it("B — invalid prose routes: rejected, no ArtifactVersion, no generated pin", () => {
    const session = startSocialToRoutes();
    assert.equal(
      classifySocialMediaProviderOutput(
        SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        proseEnvelope,
      ),
      "prose_only",
    );
    const ingested = tryIngestSocialMediaCdfCompletion({
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "social-media",
        cdfPhaseId: "routes",
      },
      rawOutput: proseEnvelope,
      executionId: "exec_text_choice_b",
      organizationId: ORG,
      projectId: PROJ,
      forceOptIn: true,
    });
    assert.ok(ingested && ingested.kind === "canonicalization_unsupported");
    const live = getCdfSession(session.sessionId)!;
    assert.equal(
      live.generatedArtifacts?.some(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      ) ?? false,
      false,
    );
  });

  it("C — packaging.routes uses same emission gate (another service)", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "packaging",
      phaseId: "routes",
    });
    assert.ok(contract);
    assert.equal(requiresCanonicalEmissionSchema(contract!), true);
    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "packaging",
      cdfPhaseId: "routes",
      cdfOmitStructuredOutput: true,
    });
    assert.equal(
      (stamped.structuredOutput as { name?: string }).name,
      "CdfPackagingRoutes",
    );
    assert.equal(assertCanonicalStructuredSchemaBeforeProvider(stamped).ok, true);
  });

  it("D — superficial text that is not routes[] still rejected by classifier", () => {
    assert.equal(
      classifySocialMediaProviderOutput(SOCIAL_MEDIA_ARTIFACT_KEYS.routes, {
        kind: "text",
        text: "just some words",
      }),
      "prose_only",
    );
    assert.equal(
      classifySocialMediaProviderOutput(SOCIAL_MEDIA_ARTIFACT_KEYS.routes, {
        routes: [{ noName: true }, { noName: true }, { noName: true }],
      }),
      "structured_incomplete",
    );
  });

  it("E — multi-option image phase has no emission schema requirement", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "packaging",
      phaseId: "3d-direction",
    });
    assert.ok(contract);
    assert.equal(contract!.executionStrategy, "canonical");
    assert.equal(requiresCanonicalEmissionSchema(contract!), false);
    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "packaging",
      cdfPhaseId: "3d-direction",
    });
    assert.equal(stamped.structuredOutput, undefined);
  });

  it("F — canonical image phase unchanged", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "packaging",
      phaseId: "front-pack",
    });
    assert.ok(contract);
    assert.equal(contract!.generationModality, "image");
    assert.equal(requiresCanonicalEmissionSchema(contract!), false);
  });

  it("G — canonical structured phase still requires emission schema", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "presentation",
      phaseId: "storyline",
    });
    assert.ok(contract);
    assert.equal(requiresCanonicalEmissionSchema(contract!), true);
    assert.equal(requiresCanonicalStructuredSchema(contract!), true);
    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "presentation",
      cdfPhaseId: "storyline",
      cdfOmitStructuredOutput: true,
    });
    assert.equal(
      (stamped.structuredOutput as { name?: string }).name,
      "CdfPresentationStoryline",
    );
  });

  it("engine stamps CdfSocialMediaRoutes before provider for routes metadata", async () => {
    const dispatcher = new SchemaAwareDispatcher(validRoutesPayload);
    const runtime = createProviderRuntime({ dispatcher });
    const toolRuntime = createToolRuntimePlatform({
      dispatcher,
      runtime,
      invocationStore: new InMemoryToolInvocationStore(),
      durable: false,
    });
    const engine = createDirectExecutionEngine({ runtime, toolRuntime });
    const result = await engine.run({
      requestId: "req_text_choice_engine",
      rawPrompt: "Generate 3 creative directions",
      organizationId: asOrganizationId(ORG),
      correlationId: "corr_text_choice_engine",
      metadata: {
        cdfServiceId: "social-media",
        cdfPhaseId: "routes",
        cdfArtifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        service: "social",
        cdfOmitStructuredOutput: true,
      },
    });
    assert.equal(result.ok, true);
    assert.ok(dispatcher.captured.length >= 1);
    const so = dispatcher.captured[0]!.metadata?.structuredOutput as {
      name?: string;
    };
    assert.equal(so?.name, "CdfSocialMediaRoutes");
  });
});
