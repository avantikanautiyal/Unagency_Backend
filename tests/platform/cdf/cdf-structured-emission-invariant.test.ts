/**
 * Framework-wide invariant:
 *   canonical + structuredEmission=required ⇒ structuredOutputContract
 *   structuredEmission=none ⇒ schema gate skipped (no invented schema)
 */

import assert from "node:assert/strict";
import { asOrganizationId } from "../../../src/platform/core/identifiers";
import { createDirectExecutionEngine } from "../../../src/platform/direct/direct-execution-engine";
import {
  assertCanonicalStructuredSchemaBeforeProvider,
  hasUsableStructuredOutputSchema,
  listRegisteredCanonicalStructuredContractNames,
  requiresCanonicalEmissionSchema,
  resolveCdfStructuredOutputStamp,
  stampCanonicalStructuredOutputMetadata,
} from "../../../src/platform/cdf/structured-output-contract";
import {
  getCdfCanonicalRegistry,
  resolveCdfPhaseExecutionContract,
  resolveStructuredEmissionPolicy,
  validateCdfCanonicalRegistry,
} from "../../../src/platform/cdf/canonical";
import { createProviderRuntime } from "../../../src/platform/providers/runtime/factories/create-provider-runtime";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";
import { createToolRuntimePlatform } from "../../../src/platform/providers/tools/composition/tool-runtime-platform";
import { InMemoryToolInvocationStore } from "../../../src/platform/providers/tools/idempotency/in-memory-tool-invocation-store";

class OrderCapturingDispatcher extends ControllableDispatcher {
  readonly captured: ProviderExecutionRequest[] = [];
  schemaNameAtDispatch: string | null = null;

  override async dispatch(
    request: ProviderExecutionRequest,
    token: Parameters<ControllableDispatcher["dispatch"]>[1],
  ) {
    this.captured.push(request);
    const so = request.metadata?.structuredOutput as
      | { name?: unknown; schema?: unknown }
      | undefined;
    this.schemaNameAtDispatch =
      so != null &&
      typeof so === "object" &&
      typeof so.name === "string" &&
      so.schema != null &&
      typeof so.schema === "object"
        ? String(so.name)
        : null;
    return super.dispatch(request, token);
  }
}

type PhaseRow = {
  serviceId: string;
  phaseId: string;
  artifactKey: string;
  emission: "required" | "none";
  contractName: string | null;
};

function listCanonicalStructuredPhases(): PhaseRow[] {
  const rows: PhaseRow[] = [];
  for (const s of getCdfCanonicalRegistry().services) {
    for (const p of s.phases) {
      if (
        p.generationModality !== "structured" ||
        p.executionStrategy !== "canonical"
      ) {
        continue;
      }
      const contract = resolveCdfPhaseExecutionContract({
        serviceId: s.serviceId,
        phaseId: p.phaseId,
      });
      assert.ok(contract);
      rows.push({
        serviceId: s.serviceId,
        phaseId: p.phaseId,
        artifactKey: p.artifact.artifactKey,
        emission: resolveStructuredEmissionPolicy(p),
        contractName: p.artifact.structuredOutputContract?.name ?? null,
      });
      void contract;
    }
  }
  return rows;
}

describe("CDF structured emission — registry-wide invariant", () => {
  const phases = listCanonicalStructuredPhases();
  const required = phases.filter((p) => p.emission === "required");
  const exempt = phases.filter((p) => p.emission === "none");

  it("registry validates with zero structured_emission_contract_missing issues", () => {
    const issues = validateCdfCanonicalRegistry(getCdfCanonicalRegistry());
    assert.equal(
      issues.filter((i) => i.code === "structured_emission_contract_missing")
        .length,
      0,
      JSON.stringify(
        issues.filter((i) => i.code === "structured_emission_contract_missing"),
      ),
    );
  });

  it("reports audit counts for canonical structured phases", () => {
    assert.ok(phases.length >= 10, `expected many structured phases, got ${phases.length}`);
    assert.ok(required.length >= 10);
    // At least one explicit non-emission structured phase (M6 patch refinement).
    assert.ok(exempt.length >= 1);
    assert.ok(
      exempt.every((p) => p.contractName == null || p.emission === "none"),
    );
  });

  it("every required emission phase has a catalog-resolvable structuredOutputContract", () => {
    const catalog = new Set(listRegisteredCanonicalStructuredContractNames());
    for (const p of required) {
      assert.ok(
        p.contractName,
        `${p.serviceId}.${p.phaseId} missing structuredOutputContract`,
      );
      assert.ok(
        catalog.has(p.contractName!),
        `${p.serviceId}.${p.phaseId} contract ${p.contractName} not in schema catalog`,
      );
      const stamp = resolveCdfStructuredOutputStamp({
        serviceId: p.serviceId,
        phaseId: p.phaseId,
      });
      assert.ok(stamp, `${p.serviceId}.${p.phaseId} stamp unresolved`);
      assert.equal(stamp!.name, p.contractName);
    }
  });

  it("exempt non-emission structured phases do not require schema and do not invent one", () => {
    for (const p of exempt) {
      const contract = resolveCdfPhaseExecutionContract({
        serviceId: p.serviceId,
        phaseId: p.phaseId,
      });
      assert.ok(contract);
      assert.equal(contract!.structuredEmission, "none");
      assert.equal(requiresCanonicalEmissionSchema(contract!), false);
      const stamped = stampCanonicalStructuredOutputMetadata({
        cdfServiceId: p.serviceId,
        cdfPhaseId: p.phaseId,
      });
      // Must not invent a schema for non-emission phases.
      assert.equal(hasUsableStructuredOutputSchema(stamped), false);
      assert.equal(
        assertCanonicalStructuredSchemaBeforeProvider(stamped).ok,
        true,
      );
    }
  });

  it("required emission phases stamp schema and pass provider gate", async () => {
    // Sample across services — not website-only.
    const sample = required.filter((p) =>
      [
        "presentation.storyline",
        "presentation.slide-content",
        "presentation.full-deck",
        "emailers.email-design",
        "brand-strategy.brand-platform",
        "ad-campaigns.campaign-strategy",
      ].includes(`${p.serviceId}.${p.phaseId}`),
    );
    assert.ok(sample.length >= 4, `sample too small: ${sample.length}`);

    for (const p of sample) {
      const stamped = stampCanonicalStructuredOutputMetadata({
        cdfServiceId: p.serviceId,
        cdfPhaseId: p.phaseId,
        cdfOmitStructuredOutput: true,
      });
      assert.equal(
        hasUsableStructuredOutputSchema(stamped),
        true,
        `${p.serviceId}.${p.phaseId}`,
      );
      assert.equal(
        (stamped.structuredOutput as { name?: string }).name,
        p.contractName,
      );
      assert.equal(
        assertCanonicalStructuredSchemaBeforeProvider(stamped).ok,
        true,
      );

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
        requestId: `req_emission_${p.serviceId}_${p.phaseId}_${Date.now()}`,
        rawPrompt: "Emit structured phase output for the brief.",
        organizationId: asOrganizationId("org_emission_audit"),
        correlationId: `corr_emission_${Date.now()}`,
        metadata: stamped,
      });
      assert.equal(result.ok, true, `${p.serviceId}.${p.phaseId} engine failed`);
      assert.ok(dispatcher.captured.length >= 1);
      assert.equal(dispatcher.schemaNameAtDispatch, p.contractName);
    }
  });

  it("missing schema on a required emission phase fails the gate; engine re-stamps from registry", async () => {
    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "presentation",
      cdfPhaseId: "storyline",
    });
    assert.equal(hasUsableStructuredOutputSchema(stamped), true);
    const stripped = { ...stamped };
    delete stripped.structuredOutput;
    delete stripped.cdfStructuredOutputStamped;
    const gate = assertCanonicalStructuredSchemaBeforeProvider(stripped);
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.error.metadata.reason, "CDF_EMISSION_SCHEMA_REQUIRED");
    }

    // DirectEngine re-stamps from the authoritative phase contract before the gate.
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
      requestId: `req_restamp_${Date.now()}`,
      rawPrompt: "Schema must be re-stamped from registry.",
      organizationId: asOrganizationId("org_emission_restamp"),
      correlationId: `corr_restamp_${Date.now()}`,
      metadata: stripped,
    });
    assert.equal(result.ok, true);
    assert.ok(dispatcher.captured.length >= 1);
    assert.equal(dispatcher.schemaNameAtDispatch, "CdfPresentationStoryline");
  });

  it("unresolvable contract name fails stamp (catalog miss)", () => {
    const base = resolveCdfPhaseExecutionContract({
      serviceId: "presentation",
      phaseId: "storyline",
    });
    assert.ok(base);
    const stamp = resolveCdfStructuredOutputStamp({
      contract: {
        ...base!,
        structuredEmission: "required",
        structuredOutputContract: {
          name: "NotRegisteredInCatalog",
          version: "1",
          strict: true,
        },
      },
    });
    assert.equal(stamp, undefined);
  });
});
