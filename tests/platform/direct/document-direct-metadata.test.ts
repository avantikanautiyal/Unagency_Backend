import {
  isDocumentDirectCreate,
  metadataRejectsDocumentPlanClassification,
  stampDocumentCreateMetadata,
} from "../../../src/platform/direct/document-direct-metadata";
import { buildIntegrationJobSummary } from "../../../src/platform/infrastructure/execution/workers/integration-job-summary";
import type { DirectExecutionReport } from "../../../src/platform/direct/contracts";

describe("document-direct-metadata", () => {
  it("detects print brochure creates", () => {
    expect(
      isDocumentDirectCreate({
        service: "print",
        subtype: "brochures",
      }),
    ).toBe(true);
  });

  it("does not treat pitch decks as documents", () => {
    expect(
      isDocumentDirectCreate({
        service: "presentations",
        subtype: "pitch-decks",
      }),
    ).toBe(false);
  });

  it("stamps DocumentPlan schema on brochure metadata", () => {
    const stamped = stampDocumentCreateMetadata({
      service: "print",
      subtype: "brochures",
      outputKind: "document",
    });
    expect(stamped.outputKind).toBe("document");
    expect(stamped.deliverableRequired).toBe(true);
    const so = stamped.structuredOutput as { name?: string; schema?: unknown };
    expect(so.name).toBe("DocumentPlan");
    expect(so.schema).toBeTruthy();
    const props = (so.schema as { properties?: Record<string, unknown> })
      .properties;
    expect(props).toHaveProperty("sections");
  });

  it("preserves an existing DocumentPlan schema", () => {
    const existing = {
      name: "DocumentPlan",
      schema: {
        type: "object",
        properties: { title: {}, summary: {}, sections: {} },
      },
      strict: true,
    };
    const stamped = stampDocumentCreateMetadata({
      service: "print",
      subtype: "leaflets",
      structuredOutput: existing,
    });
    expect(stamped.structuredOutput).toEqual(existing);
  });

  it("rejects DocumentPlan for print-ooh master-artwork image.generate (leaflets)", () => {
    const meta = {
      service: "print",
      subtype: "leaflets",
      outputKind: "image",
      cdfServiceId: "print-ooh",
      cdfPhaseId: "master-artwork",
      cdfGenerationModality: "image",
      cdfArtifactKey: "print-ooh.master-artwork",
    };
    expect(metadataRejectsDocumentPlanClassification(meta)).toBe(true);
    expect(isDocumentDirectCreate(meta)).toBe(false);
    expect(
      isDocumentDirectCreate(meta, { capabilityId: "image.generate" }),
    ).toBe(false);
    const stamped = stampDocumentCreateMetadata(meta);
    expect(stamped.structuredOutput).toBeUndefined();
    expect(stamped.outputKind).toBe("image");
  });

  it("rejects DocumentPlan for sealed CDF text creative routes (print+leaflet)", () => {
    const meta = {
      service: "print",
      subtype: "leaflets",
      outputKind: "text",
      cdfServiceId: "print-ooh",
      cdfPhaseId: "routes",
      cdfGenerationModality: "text",
      cdfArtifactKey: "print-ooh.routes",
      structuredOutput: { name: "CdfCreativeDirections" },
    };
    expect(isDocumentDirectCreate(meta)).toBe(false);
  });

  it("still classifies legacy unset print leaflet as DocumentPlan", () => {
    expect(
      isDocumentDirectCreate({
        service: "print",
        subtype: "leaflets",
      }),
    ).toBe(true);
  });
});

describe("integration-job-summary DocumentPlan boundary", () => {
  function baseReport(
    overrides: {
      metadata?: Record<string, unknown>;
      success?: boolean;
    },
  ): DirectExecutionReport {
    const metadata = overrides.metadata ?? {};
    return {
      success: overrides.success ?? false,
      resultId: "r1",
      durationMs: 100,
      stagesCompleted: ["provider_runtime"],
      request: {
        requestId: "req_1",
        rawPrompt: "master artwork",
        metadata,
      },
      trace: {
        stages: [
          {
            stage: "provider_runtime",
            status: "failed",
            message: "quota exhausted",
          },
        ],
      },
      artifacts: {
        task: {
          capabilityMap: { primary: "image.generate" },
          metadata,
        },
        runtime: {
          error: { message: "quota exhausted" },
          response: { output: {} },
          finalProviderId: "provider.google",
          finalModelId: "gemini-3-pro-image",
          failoverCount: 1,
          attemptHistory: [],
          statistics: { totalMs: 100 },
        },
        routing: {
          plan: {
            primary: {
              providerId: "provider.openai",
              modelId: "gpt-image-2.5-sunburst",
            },
          },
        },
      },
    } as unknown as DirectExecutionReport;
  }

  it("does not report DocumentPlan missing for CDF master-artwork image failure", () => {
    const summary = buildIntegrationJobSummary({
      report: baseReport({
        metadata: {
          service: "print",
          subtype: "leaflets",
          outputKind: "image",
          cdfServiceId: "print-ooh",
          cdfPhaseId: "master-artwork",
          cdfGenerationModality: "image",
          cdfArtifactKey: "print-ooh.master-artwork",
        },
      }),
      executionMode: "live",
      durationMs: 100,
    });
    expect(String(summary.errorMessage ?? "")).not.toMatch(/DocumentPlan/i);
    expect(String(summary.errorMessage ?? "")).toMatch(/quota|failed/i);
  });

  it("still requires DocumentPlan for explicit document jobs", () => {
    const meta = {
      service: "print",
      subtype: "brochures",
      outputKind: "document",
      structuredOutput: { name: "DocumentPlan" },
    };
    const summary = buildIntegrationJobSummary({
      report: {
        success: true,
        resultId: "r2",
        durationMs: 50,
        stagesCompleted: ["provider_runtime"],
        request: {
          requestId: "req_2",
          rawPrompt: "brochure",
          metadata: meta,
        },
        trace: { stages: [] },
        artifacts: {
          task: {
            capabilityMap: { primary: "text.generate" },
            metadata: meta,
          },
          runtime: {
            response: { output: {} },
            statistics: { totalMs: 50 },
          },
          routing: {
            plan: {
              primary: {
                providerId: "provider.openai",
                modelId: "gpt-5.5",
              },
            },
          },
        },
      } as unknown as DirectExecutionReport,
      executionMode: "live",
      durationMs: 50,
    });
    expect(summary.success).toBe(false);
    expect(String(summary.errorMessage ?? "")).toMatch(/DocumentPlan/);
  });
});
