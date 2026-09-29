/**
 * Framework invariant: canonical + structured → schema before provider, or fail closed.
 * No service/phase special-casing — contract + artifactKey catalog only.
 */

import assert from "node:assert/strict";
import { asOrganizationId } from "../../../src/platform/core/identifiers";
import { createDirectExecutionEngine } from "../../../src/platform/direct/direct-execution-engine";
import {
  assertCanonicalStructuredSchemaBeforeProvider,
  hasUsableStructuredOutputSchema,
  listRegisteredCanonicalStructuredArtifactKeys,
  requiresCanonicalStructuredSchema,
  resolveCdfStructuredOutputStamp,
  stampCanonicalStructuredOutputMetadata,
} from "../../../src/platform/cdf/structured-output-contract";
import {
  getCdfCanonicalRegistry,
  resolveCdfPhaseExecutionContract,
} from "../../../src/platform/cdf/canonical";
import { createProviderRuntime } from "../../../src/platform/providers/runtime/factories/create-provider-runtime";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";
import { createToolRuntimePlatform } from "../../../src/platform/providers/tools/composition/tool-runtime-platform";
import { InMemoryToolInvocationStore } from "../../../src/platform/providers/tools/idempotency/in-memory-tool-invocation-store";

class OrderCapturingDispatcher extends ControllableDispatcher {
  readonly captured: ProviderExecutionRequest[] = [];
  schemaPresentAtDispatch: boolean | null = null;

  override async dispatch(
    request: ProviderExecutionRequest,
    token: Parameters<ControllableDispatcher["dispatch"]>[1],
  ) {
    this.captured.push(request);
    const so = request.metadata?.structuredOutput as
      | { schema?: unknown }
      | undefined;
    this.schemaPresentAtDispatch =
      so != null && typeof so === "object" && so.schema != null && typeof so.schema === "object";
    return super.dispatch(request, token);
  }
}

function listStructuredCanonicalPhases(): Array<{
  serviceId: string;
  phaseId: string;
  artifactKey: string;
}> {
  const rows: Array<{
    serviceId: string;
    phaseId: string;
    artifactKey: string;
  }> = [];
  for (const s of getCdfCanonicalRegistry().services) {
    for (const p of s.phases) {
      if (
        p.generationModality === "structured" &&
        p.executionStrategy === "canonical"
      ) {
        rows.push({
          serviceId: s.serviceId,
          phaseId: p.phaseId,
          artifactKey: p.artifact.artifactKey,
        });
      }
    }
  }
  return rows;
}

async function runEngine(input: {
  metadata: Record<string, unknown>;
  prompt?: string;
}): Promise<{
  ok: boolean;
  errorMessage?: string;
  errorMeta?: Record<string, unknown>;
  providerInvoked: boolean;
  schemaPresentAtDispatch: boolean | null;
  dispatcher: OrderCapturingDispatcher;
}> {
  const dispatcher = new OrderCapturingDispatcher({ mode: "success" });
  const runtime = createProviderRuntime({ dispatcher });
  const toolRuntime = createToolRuntimePlatform({
    dispatcher,
    runtime,
    invocationStore: new InMemoryToolInvocationStore(),
    durable: false,
  });
  const engine = createDirectExecutionEngine({ runtime, toolRuntime });
  const result = await engine.run({
    requestId: `req_structured_schema_${Date.now()}`,
    rawPrompt: input.prompt ?? "Generate structured phase output for the brief.",
    organizationId: asOrganizationId("org_test_structured_schema"),
    correlationId: `corr_structured_${Date.now()}`,
    metadata: input.metadata,
  });
  return {
    ok: result.ok,
    errorMessage: result.ok ? undefined : String(result.error?.message ?? ""),
    errorMeta: result.ok
      ? undefined
      : ((result.error as { metadata?: Record<string, unknown> })?.metadata ?? {}),
    providerInvoked: dispatcher.captured.length > 0,
    schemaPresentAtDispatch: dispatcher.schemaPresentAtDispatch,
    dispatcher,
  };
}

describe("CDF canonical structured schema invariant (framework)", () => {
  it("A — canonical structured with registered schema: stamp present, provider allowed", async () => {
    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "presentation",
      cdfPhaseId: "storyline",
      service: "presentations",
      cdfOmitStructuredOutput: true,
    });
    assert.equal(hasUsableStructuredOutputSchema(stamped), true);
    assert.equal(
      (stamped.structuredOutput as { name?: string }).name,
      "CdfPresentationStoryline",
    );

    const run = await runEngine({ metadata: stamped });
    assert.equal(run.ok, true);
    assert.equal(run.providerInvoked, true);
    assert.equal(run.schemaPresentAtDispatch, true);
  });

  it("B — required emission phase with stripped schema: gate fails closed; engine re-stamps", async () => {
    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "presentation",
      cdfPhaseId: "storyline",
      service: "presentations",
    });
    assert.equal(hasUsableStructuredOutputSchema(stamped), true);
    const stripped = { ...stamped };
    delete stripped.structuredOutput;
    delete stripped.cdfStructuredOutputStamped;

    const gate = assertCanonicalStructuredSchemaBeforeProvider(stripped);
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.error.metadata.reason, "CDF_EMISSION_SCHEMA_REQUIRED");
      assert.equal(gate.error.metadata.serviceId, "presentation");
      assert.equal(gate.error.metadata.phaseId, "storyline");
      assert.equal(gate.error.metadata.artifactKey, "presentation.storyline");
      assert.equal(gate.error.metadata.executionStrategy, "canonical");
      assert.equal(gate.error.metadata.generationModality, "structured");
    }

    // Authoritative stamp path restores schema from the phase contract.
    const run = await runEngine({ metadata: stripped });
    assert.equal(run.ok, true);
    assert.equal(run.providerInvoked, true);
    assert.equal(run.schemaPresentAtDispatch, true);
  });

  it("C — canonical image phase: no structured schema requirement", async () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "packaging",
      phaseId: "front-pack",
    });
    assert.ok(contract);
    assert.equal(contract!.generationModality, "image");
    assert.equal(contract!.executionStrategy, "canonical");
    assert.equal(requiresCanonicalStructuredSchema(contract!), false);

    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "packaging",
      cdfPhaseId: "front-pack",
      service: "packaging",
      outputKind: "image",
      capabilityId: "image.generate",
    });
    assert.equal(hasUsableStructuredOutputSchema(stamped), false);
    assert.equal(assertCanonicalStructuredSchemaBeforeProvider(stamped).ok, true);
  });

  it("D — multi-option image phase is canonical (no structured schema gate)", async () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "packaging",
      phaseId: "3d-direction",
    });
    assert.ok(contract);
    assert.equal(contract!.executionStrategy, "canonical");
    assert.equal(contract!.generationModality, "image");
    assert.equal(contract!.allowsModelGenerationFanout, true);
    assert.equal(requiresCanonicalStructuredSchema(contract!), false);

    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "packaging",
      cdfPhaseId: "3d-direction",
      service: "packaging",
    });
    assert.equal(assertCanonicalStructuredSchemaBeforeProvider(stamped).ok, true);
  });

  it("E — legacy / none phase: unchanged", async () => {
    const nonePhases = listStructuredCanonicalPhases().filter(() => false);
    void nonePhases;
    // Find a none or legacy strategy phase from registry.
    let legacyOrNone: { serviceId: string; phaseId: string } | undefined;
    for (const s of getCdfCanonicalRegistry().services) {
      for (const p of s.phases) {
        if (p.executionStrategy === "none" || p.executionStrategy === "legacy") {
          legacyOrNone = { serviceId: s.serviceId, phaseId: p.phaseId };
          break;
        }
      }
      if (legacyOrNone) break;
    }
    assert.ok(legacyOrNone, "expected at least one legacy/none phase in registry");
    const contract = resolveCdfPhaseExecutionContract(legacyOrNone!);
    assert.ok(contract);
    assert.equal(requiresCanonicalStructuredSchema(contract!), false);
    assert.equal(
      assertCanonicalStructuredSchemaBeforeProvider({
        cdfServiceId: legacyOrNone!.serviceId,
        cdfPhaseId: legacyOrNone!.phaseId,
      }).ok,
      true,
    );
  });

  it("F — multiple structured canonical services/phases use the same rule", () => {
    const phases = listStructuredCanonicalPhases();
    assert.ok(phases.length >= 5, `expected several structured+canonical phases, got ${phases.length}`);

    const withSchema = phases.filter(
      (p) =>
        resolveCdfStructuredOutputStamp({
          serviceId: p.serviceId,
          phaseId: p.phaseId,
        }) != null,
    );
    const withoutSchema = phases.filter(
      (p) =>
        resolveCdfStructuredOutputStamp({
          serviceId: p.serviceId,
          phaseId: p.phaseId,
        }) == null,
    );

    assert.ok(withSchema.some((p) => p.serviceId === "presentation"));
    assert.ok(withSchema.some((p) => p.artifactKey === "presentation.storyline"));
    assert.ok(withSchema.some((p) => p.artifactKey === "presentation.slide-content"));
    assert.ok(withSchema.some((p) => p.artifactKey === "web-tech.sitemap"));
    assert.ok(withSchema.some((p) => p.artifactKey === "brand-strategy.brand-platform"));
    // Non-emission structured phases (structuredEmission: none) stay without stamps.
    assert.ok(
      withoutSchema.some((p) => p.phaseId === "slide-refinement"),
      "expected explicit non-emission structured phase without catalog stamp",
    );

    // Contract-name catalog remains the registry source of truth.
    assert.ok(listRegisteredCanonicalStructuredArtifactKeys().length >= 3);

    for (const p of withSchema) {
      const stamped = stampCanonicalStructuredOutputMetadata({
        cdfServiceId: p.serviceId,
        cdfPhaseId: p.phaseId,
      });
      assert.equal(
        hasUsableStructuredOutputSchema(stamped),
        true,
        `${p.serviceId}.${p.phaseId} should stamp`,
      );
      assert.equal(assertCanonicalStructuredSchemaBeforeProvider(stamped).ok, true);
    }
    for (const p of withoutSchema) {
      const stamped = stampCanonicalStructuredOutputMetadata({
        cdfServiceId: p.serviceId,
        cdfPhaseId: p.phaseId,
      });
      assert.equal(
        hasUsableStructuredOutputSchema(stamped),
        false,
        `${p.serviceId}.${p.phaseId} should not invent a schema`,
      );
      const contract = resolveCdfPhaseExecutionContract({
        serviceId: p.serviceId,
        phaseId: p.phaseId,
      });
      assert.ok(contract);
      const gate = assertCanonicalStructuredSchemaBeforeProvider(stamped);
      if (contract!.structuredEmission === "none") {
        assert.equal(
          gate.ok,
          true,
          `${p.serviceId}.${p.phaseId} non-emission must skip gate`,
        );
      } else {
        assert.equal(
          gate.ok,
          false,
          `${p.serviceId}.${p.phaseId} must fail closed`,
        );
      }
    }
  });

  it("G — schema present BEFORE provider dispatch (ordering)", async () => {
    const run = await runEngine({
      metadata: {
        cdfServiceId: "presentation",
        cdfPhaseId: "storyline",
        service: "presentations",
        cdfOmitStructuredOutput: true,
      },
    });
    assert.equal(run.ok, true);
    assert.equal(run.providerInvoked, true);
    assert.equal(run.schemaPresentAtDispatch, true);
    // Dispatcher only runs after engine gate — schema was on the request at dispatch.
    assert.ok(run.dispatcher.captured.length >= 1);
  });

  it("H — sitemap stamps declared CdfWebsiteSitemap (not generic ApprovalDoc)", async () => {
    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "web-tech",
      cdfPhaseId: "sitemap",
    });
    assert.equal(hasUsableStructuredOutputSchema(stamped), true);
    assert.equal(
      (stamped.structuredOutput as { name?: string }).name,
      "CdfWebsiteSitemap",
    );
    assert.notEqual(
      (stamped.structuredOutput as { name?: string }).name,
      "CdfStructuredApprovalDoc",
    );
    const gate = assertCanonicalStructuredSchemaBeforeProvider(stamped);
    assert.equal(gate.ok, true);

    const run = await runEngine({ metadata: stamped });
    assert.equal(run.ok, true);
    assert.equal(run.providerInvoked, true);
    assert.equal(run.schemaPresentAtDispatch, true);
  });

  it("H3 — page-structure stamps declared CdfWebsitePageStructure (not ApprovalDoc)", async () => {
    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "web-tech",
      cdfPhaseId: "page-structure",
    });
    assert.equal(hasUsableStructuredOutputSchema(stamped), true);
    assert.equal(
      (stamped.structuredOutput as { name?: string }).name,
      "CdfWebsitePageStructure",
    );
    assert.notEqual(
      (stamped.structuredOutput as { name?: string }).name,
      "CdfStructuredApprovalDoc",
    );
    const gate = assertCanonicalStructuredSchemaBeforeProvider(stamped);
    assert.equal(gate.ok, true);

    const run = await runEngine({ metadata: stamped });
    assert.equal(run.ok, true);
    assert.equal(run.providerInvoked, true);
    assert.equal(run.schemaPresentAtDispatch, true);
  });

  it("H2 — explicit non-emission structured phase skips schema gate", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "presentation",
      phaseId: "slide-refinement",
    });
    assert.ok(contract);
    assert.equal(contract!.structuredEmission, "none");
    assert.equal(requiresCanonicalStructuredSchema(contract!), false);

    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "presentation",
      cdfPhaseId: "slide-refinement",
    });
    assert.equal(hasUsableStructuredOutputSchema(stamped), false);
    const gate = assertCanonicalStructuredSchemaBeforeProvider(stamped);
    assert.equal(gate.ok, true);
  });

  it("does not stamp PresentationRouteConcepts for storyline (wrong schema)", () => {
    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "presentation",
      cdfPhaseId: "storyline",
      service: "presentations",
      cdfOmitStructuredOutput: true,
    });
    assert.notEqual(
      (stamped.structuredOutput as { name?: string }).name,
      "PresentationRouteConcepts",
    );
    assert.equal(
      (stamped.structuredOutput as { name?: string }).name,
      "CdfPresentationStoryline",
    );
  });
});
