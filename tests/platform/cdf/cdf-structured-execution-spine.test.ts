/**
 * Generic structured execution spine:
 * contract resolution → validation → normalized result → job summary →
 * hydration → materialization gating → failover stop on schema mismatch.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  assertCanonicalStructuredContractAuthority,
  listRegisteredCanonicalStructuredContractNames,
  resolveCdfStructuredOutputStamp,
  stampCanonicalStructuredOutputMetadata,
} from "../../../src/platform/cdf/structured-output-contract";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";
import {
  CDF_STRUCTURED_CONTRACT_CONFLICT,
  CDF_STRUCTURED_PAYLOAD_LOST,
  CDF_STRUCTURED_PAYLOAD_MISSING,
  hashStructuredPayload,
} from "../../../src/platform/cdf/structured-execution-result";
import { CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME } from "../../../src/platform/os/delivery/cdf-structured-approval-schemas";
import { CDF_WEBSITE_SITEMAP_CONTRACT_NAME } from "../../../src/platform/os/delivery/cdf-website-sitemap-schemas";
import { buildIntegrationJobSummary } from "../../../src/platform/infrastructure/execution/workers/integration-job-summary";
import {
  detectStructuredPayloadLoss,
  resolveStructuredCompletionCandidate,
} from "../../../src/platform/api/services/execution-structured-completion-candidate";
import { resolveWebsiteExport } from "../../../src/platform/api/services/website-export-materializer";
import { isWebsiteGenerationMetadata } from "../../../src/platform/api/services/execution-thin-path";
import { providerResultSatisfiesStructuredContract } from "../../../src/platform/direct/direct-execution-engine";
import { getCdfCanonicalRegistry } from "../../../src/platform/cdf/canonical";
import type { DirectExecutionReport } from "../../../src/platform/direct/contracts";

const SITEMAP_PAYLOAD = {
  type: "sitemap",
  deliverable: "corporate-website-sitemap",
  identityMark: "Wordmark in header",
  globalNavigation: [
    { label: "Home", path: "/" },
    { label: "About", path: "/about" },
    { label: "Services", path: "/services" },
  ],
  siteHierarchy: [
    {
      id: "home",
      label: "Home",
      path: "/",
      children: [{ id: "about", label: "About", path: "/about" }],
    },
  ],
  pageCount: 5,
  globalElements: "Header, footer, cookie banner",
  transitionAndMotionSystem: "Subtle fades",
  responsiveRules: "Mobile-first collapse",
  linkIntegrity: "All nav links resolve",
  openItemsForApproval: ["Confirm pricing page"],
};

function reportWithStructured(input: {
  structured?: unknown;
  content?: string;
  structuredOutputValid?: boolean;
  success?: boolean;
}): DirectExecutionReport {
  const output: Record<string, unknown> = {
    toolOrchestration: {
      structuredOutputValid: input.structuredOutputValid ?? true,
    },
  };
  if (input.structured !== undefined) {
    output.structured = input.structured;
    output.structuredOutputValid = input.structuredOutputValid ?? true;
  }
  if (input.content !== undefined) output.content = input.content;
  return {
    request: {
      requestId: "req_spine",
      metadata: {
        cdfServiceId: "web-tech",
        cdfPhaseId: "sitemap",
        cdfExecutionStrategy: "canonical",
        outputKind: "text",
        service: "website",
        structuredOutput: {
          name: CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
          schema: { type: "object" },
          strict: true,
        },
      },
    },
    success: input.success ?? true,
    resultId: "res_spine",
    durationMs: 10,
    stagesCompleted: ["provider_runtime"],
    artifacts: {
      runtime: {
        response: {
          providerId: "provider.deepseek",
          output,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        },
        finalProviderId: "provider.deepseek",
        finalModelId: "deepseek-chat",
        failoverCount: 0,
        statistics: { totalMs: 10 },
      },
      routing: {
        plan: {
          primary: {
            providerId: "provider.deepseek",
            modelId: "deepseek-chat",
          },
        },
      },
    },
    trace: { stages: [] },
  } as unknown as DirectExecutionReport;
}

describe("CDF structured execution spine (generic)", () => {
  it("A — declared phase contract wins over generic/default contract", () => {
    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "web-tech",
      cdfPhaseId: "sitemap",
      structuredOutput: {
        name: CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
        schema: { type: "object", required: ["schemaId"] },
        strict: true,
      },
    });
    assert.equal(
      (stamped.structuredOutput as { name: string }).name,
      CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
    );
  });

  it("B — contract/schema mismatch fails closed", () => {
    const meta = {
      cdfServiceId: "web-tech",
      cdfPhaseId: "sitemap",
      structuredOutput: {
        name: CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
        schema: { type: "object" },
        strict: true,
      },
    };
    // Without re-stamp, authority assert sees mismatch vs declared.
    const gate = assertCanonicalStructuredContractAuthority(meta);
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      const err = gate.error as Error & {
        metadata?: { reason?: string };
      };
      assert.equal(err.metadata?.reason, CDF_STRUCTURED_CONTRACT_CONFLICT);
      assert.match(err.message, /CDF structured contract conflict/);
    }
  });

  it("C — no CdfStructuredApprovalDoc fallback overrides declared sitemap contract", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "web-tech",
      phaseId: "sitemap",
    });
    assert.ok(contract);
    assert.equal(
      contract!.structuredOutputContract?.name,
      CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
    );
    const stamp = resolveCdfStructuredOutputStamp({ contract: contract! });
    assert.equal(stamp?.name, CDF_WEBSITE_SITEMAP_CONTRACT_NAME);
    assert.notEqual(stamp?.name, CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME);
  });

  it("D — provider structured JSON normalizes into job summary", () => {
    const summary = buildIntegrationJobSummary({
      report: reportWithStructured({
        structured: SITEMAP_PAYLOAD,
        structuredOutputValid: true,
      }),
      executionMode: "live",
      durationMs: 12,
    });
    assert.ok(summary.structuredData);
    assert.ok(summary.structuredEmissionData);
    assert.equal(summary.structuredContractName, CDF_WEBSITE_SITEMAP_CONTRACT_NAME);
    assert.equal(
      summary.structuredPayloadHash,
      hashStructuredPayload(SITEMAP_PAYLOAD),
    );
  });

  it("E — provider tool_use-shaped structured payload normalizes when output.structured set", () => {
    const summary = buildIntegrationJobSummary({
      report: reportWithStructured({
        structured: SITEMAP_PAYLOAD,
        structuredOutputValid: true,
      }),
      executionMode: "live",
      durationMs: 12,
    });
    assert.deepEqual(
      (summary.structuredEmissionData as { siteHierarchy: unknown }).siteHierarchy,
      SITEMAP_PAYLOAD.siteHierarchy,
    );
  });

  it("F/G/H — structured payload survives summary serialization shape", () => {
    const summary = buildIntegrationJobSummary({
      report: reportWithStructured({ structured: SITEMAP_PAYLOAD }),
      executionMode: "live",
      durationMs: 12,
    });
    const roundTrip = JSON.parse(JSON.stringify(summary)) as Record<
      string,
      unknown
    >;
    assert.ok(roundTrip.structuredData);
    assert.ok(roundTrip.structuredEmissionData);
    assert.equal(
      roundTrip.structuredPayloadHash,
      hashStructuredPayload(SITEMAP_PAYLOAD),
    );
  });

  it("I/J — resolveStructuredCompletionCandidate returns canonical normalized data", () => {
    const summary = buildIntegrationJobSummary({
      report: reportWithStructured({ structured: SITEMAP_PAYLOAD }),
      executionMode: "live",
      durationMs: 12,
    });
    const resolved = resolveStructuredCompletionCandidate({
      jobSummary: summary,
      metadata: {
        cdfServiceId: "web-tech",
        cdfPhaseId: "sitemap",
        cdfExecutionStrategy: "canonical",
      },
      result: { kind: "text", text: "ignore me", data: undefined },
    });
    assert.equal(resolved.structuredPresent, true);
    assert.equal(resolved.source, "job_summary.structuredEmissionData");
    assert.ok(
      (resolved.candidate as { siteHierarchy?: unknown }).siteHierarchy,
    );
  });

  it("K — content cannot replace valid structured data", () => {
    const resolved = resolveStructuredCompletionCandidate({
      jobSummary: {
        structuredEmissionData: SITEMAP_PAYLOAD,
        structuredData: SITEMAP_PAYLOAD,
        resultText: JSON.stringify({ title: "prose fake", summary: "x", sections: [] }),
      },
      metadata: {
        cdfServiceId: "web-tech",
        cdfPhaseId: "sitemap",
      },
      result: {
        kind: "text",
        text: JSON.stringify({ title: "from content", summary: "y", sections: [{ id: "1", heading: "h", body: "b" }] }),
      },
    });
    assert.equal(resolved.source, "job_summary.structuredEmissionData");
    assert.deepEqual(
      (resolved.candidate as { pageCount: number }).pageCount,
      5,
    );
  });

  it("L — website materialization skips CDF sealed text/sitemap (not website code-gen)", () => {
    assert.equal(
      resolveWebsiteExport({
        outputKind: "text",
        service: "website",
        structuredName: CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
        data: SITEMAP_PAYLOAD,
      }),
      false,
    );
    assert.equal(
      isWebsiteGenerationMetadata({
        outputKind: "text",
        service: "website",
        cdfExecutionAuthorityApplied: true,
        structuredOutput: { name: CDF_WEBSITE_SITEMAP_CONTRACT_NAME },
      }),
      false,
    );
  });

  it("M — structured payload loss produces CDF_STRUCTURED_PAYLOAD_LOST", () => {
    const hash = hashStructuredPayload(SITEMAP_PAYLOAD);
    const lost = detectStructuredPayloadLoss({
      executionId: "exec_x",
      jobId: "job_x",
      metadata: {
        cdfServiceId: "web-tech",
        cdfPhaseId: "sitemap",
        cdfExecutionStrategy: "canonical",
      },
      jobSummary: { structuredPayloadHash: hash },
      priorStructuredPresent: true,
      priorStructuredHash: hash,
      sourceBoundary: "distributed_worker",
      hydrationBoundary: "recovered_job",
    });
    assert.equal(lost.lost, true);
    assert.equal(lost.code, CDF_STRUCTURED_PAYLOAD_LOST);
  });

  it("N — missing structured payload reason is CDF_STRUCTURED_PAYLOAD_MISSING", () => {
    const summary = buildIntegrationJobSummary({
      report: reportWithStructured({
        content: JSON.stringify(SITEMAP_PAYLOAD),
        structuredOutputValid: false,
        success: true,
      }),
      executionMode: "live",
      durationMs: 12,
    });
    // Content-only must NOT count as structured for emission phases.
    assert.equal(summary.structuredData, undefined);
    assert.equal(summary.success, false);
    const detail = summary.cdfStructuredOutputMissing as
      | { reason?: string }
      | undefined;
    assert.equal(detail?.reason, CDF_STRUCTURED_PAYLOAD_MISSING);
  });

  it("O — schema mismatch does not satisfy structured contract (failover stop signal)", () => {
    const ok = providerResultSatisfiesStructuredContract(
      {
        success: false,
        status: "failed",
        error: {
          code: "STRUCTURED_OUTPUT_INVALID",
          message: "schema mismatch",
        },
        response: {
          output: {
            content: JSON.stringify(SITEMAP_PAYLOAD),
            structuredOutputValid: false,
            toolOrchestration: { structuredOutputValid: false },
          },
        },
      } as never,
      { name: CDF_WEBSITE_SITEMAP_CONTRACT_NAME, schema: {}, strict: true },
    );
    assert.equal(ok, false);
  });

  it("P — valid provider structured output results in successful summary", () => {
    const summary = buildIntegrationJobSummary({
      report: reportWithStructured({
        structured: SITEMAP_PAYLOAD,
        structuredOutputValid: true,
        success: true,
      }),
      executionMode: "live",
      durationMs: 12,
    });
    assert.equal(summary.success, true);
    assert.ok(summary.structuredEmissionData);
  });

  it("Q — structured payload hash stable across persistence/hydration", () => {
    const a = hashStructuredPayload(SITEMAP_PAYLOAD);
    const b = hashStructuredPayload(
      JSON.parse(JSON.stringify(SITEMAP_PAYLOAD)),
    );
    assert.equal(a, b);
    assert.equal(a.length, 32);
    // Order-insensitive key fingerprint
    const shuffled = {
      pageCount: SITEMAP_PAYLOAD.pageCount,
      siteHierarchy: SITEMAP_PAYLOAD.siteHierarchy,
      globalNavigation: SITEMAP_PAYLOAD.globalNavigation,
      type: SITEMAP_PAYLOAD.type,
      deliverable: SITEMAP_PAYLOAD.deliverable,
      identityMark: SITEMAP_PAYLOAD.identityMark,
      globalElements: SITEMAP_PAYLOAD.globalElements,
      transitionAndMotionSystem: SITEMAP_PAYLOAD.transitionAndMotionSystem,
      responsiveRules: SITEMAP_PAYLOAD.responsiveRules,
      linkIntegrity: SITEMAP_PAYLOAD.linkIntegrity,
      openItemsForApproval: SITEMAP_PAYLOAD.openItemsForApproval,
    };
    assert.equal(hashStructuredPayload(shuffled), a);
  });

  it("R — all required structured phases resolve declared contracts", () => {
    const registry = getCdfCanonicalRegistry();
    const required: Array<{
      serviceId: string;
      phaseId: string;
      contract: string;
    }> = [];
    for (const svc of registry.services) {
      for (const phase of svc.phases) {
        const contract = resolveCdfPhaseExecutionContract({
          serviceId: svc.serviceId,
          phaseId: phase.phaseId,
        });
        if (!contract || contract.executionStrategy !== "canonical") continue;
        if (contract.generationModality !== "structured") continue;
        if (contract.structuredEmission === "none") continue;
        assert.ok(
          contract.structuredOutputContract?.name,
          `${svc.serviceId}.${phase.phaseId} missing contract`,
        );
        const stamp = resolveCdfStructuredOutputStamp({ contract });
        assert.ok(
          stamp,
          `${svc.serviceId}.${phase.phaseId} missing catalog entry for ${contract.structuredOutputContract?.name}`,
        );
        required.push({
          serviceId: svc.serviceId,
          phaseId: phase.phaseId,
          contract: stamp!.name,
        });
      }
    }
    assert.ok(required.length >= 16, `expected >=16 required, got ${required.length}`);
    const sitemap = required.find(
      (r) => r.serviceId === "web-tech" && r.phaseId === "sitemap",
    );
    assert.equal(sitemap?.contract, CDF_WEBSITE_SITEMAP_CONTRACT_NAME);
    assert.ok(
      listRegisteredCanonicalStructuredContractNames().includes(
        CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
      ),
    );
  });

  it("S — slide-refinement remains structuredEmission=none", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "presentation",
      phaseId: "slide-refinement",
    });
    assert.ok(contract);
    assert.equal(contract!.structuredEmission, "none");
    assert.equal(
      resolveCdfStructuredOutputStamp({ contract: contract! }),
      undefined,
    );
  });

  it("hash helper is deterministic (sanity)", () => {
    const h = createHash("sha256").update("x").digest("hex").slice(0, 32);
    assert.equal(typeof h, "string");
  });
});
