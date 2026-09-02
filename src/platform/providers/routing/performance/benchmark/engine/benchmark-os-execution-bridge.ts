/**
 * Step 5 — Benchmark execution through the canonical UnAgency OS pipeline.
 * Model → structured output → OS materializers → artifacts → Step 2 validation.
 */

import type { ProviderExecutionResult } from "../../../../../providers/runtime/contracts/provider-execution-response";
import {
  asOrganizationId,
  asWorkspaceId,
} from "../../../../../core/identifiers";
import type { IDirectExecutionEngine } from "../../../../../direct/contracts";
import type { DirectExecutionRequest } from "../../../../../direct/contracts";
import {
  materializeDocumentExports,
  resolveDocumentExportKind,
} from "../../../../../api/services/document-export-materializer";
import { materializeWebsiteExport } from "../../../../../api/services/website-export-materializer";
import { materializeSyncImageArtifacts } from "../../../../../api/services/sync-image-artifact-materializer";
import { createAsyncMediaPlatform } from "../../../../../infrastructure/durability/create-async-media-platform";
import type { AsyncMediaPlatform } from "../../../../../infrastructure/durability/create-async-media-platform";
import { InMemoryArtifactRepository } from "../../../../../infrastructure/durability/repositories/in-memory-execution-persistence";
import type { IArtifactRepository } from "../../../../../infrastructure/durability/interfaces/execution-store-ports";
import { checkBenchmarkCompatibility } from "./benchmark-compatibility";
import {
  buildBenchmarkOsMetadata,
  benchmarkCaseUsesOsArtifactPipeline,
} from "./benchmark-os-execution-metadata";
import { BENCHMARK_OS_EXECUTOR_PROFILE } from "./benchmark-execution-profile";
import type { BenchmarkCase, BenchmarkModelTarget, BenchmarkStrategy } from "../contracts/benchmark-case";
import type { BenchmarkExecutionOutput } from "./record-builder";
import { resolveExecutableModelId } from "../../failover/executable-model-id";
import { classifyExecutionFailure } from "../../failover/failure-classification";
import { recoverPresentationRoutesPayload } from "../../../../../os/delivery/document-export-service";
import { recoverWebProjectPlan, recoverWebsiteRoutesPlan } from "../../../../../os/delivery/website-generation";
import { resolveBenchmarkCapability } from "./benchmark-capability-resolver";

export type BenchmarkOsExecutionBridgeDeps = {
  readonly engine: IDirectExecutionEngine;
  readonly asyncMedia?: AsyncMediaPlatform;
  readonly artifactsRepo?: IArtifactRepository;
  readonly workspaceId?: string;
  readonly clockMs?: () => number;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
};

function runtimeOutputFromResult(
  runtime: ProviderExecutionResult | undefined,
): Record<string, unknown> | undefined {
  const output = runtime?.response?.output;
  if (!output || typeof output !== "object") return undefined;
  return output as Record<string, unknown>;
}

function extractStructured(runtime?: Record<string, unknown>): unknown {
  if (!runtime) return undefined;
  if (runtime.structured != null) return runtime.structured;
  if (runtime.structuredOutput != null) return runtime.structuredOutput;
  const content = runtime.content;
  if (typeof content === "string") {
    try {
      return JSON.parse(content);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function previewFromRuntime(runtime?: Record<string, unknown>): string {
  if (!runtime) return "";
  if (typeof runtime.content === "string") return runtime.content;
  if (typeof runtime.text === "string") return runtime.text;
  const structured = extractStructured(runtime);
  if (structured != null) {
    try {
      return JSON.stringify(structured);
    } catch {
      return String(structured);
    }
  }
  return "";
}

export function createBenchmarkAsyncMediaPlatform(): {
  readonly platform: AsyncMediaPlatform;
  readonly artifactsRepo: IArtifactRepository;
} {
  const artifactsRepo = new InMemoryArtifactRepository();
  return Object.freeze({
    platform: createAsyncMediaPlatform({
      forceInMemory: true,
      artifactsRepo,
    }),
    artifactsRepo,
  });
}

export async function materializeBenchmarkOsArtifacts(input: {
  readonly benchmarkCase: BenchmarkCase;
  readonly asyncMedia: AsyncMediaPlatform;
  readonly executionId: string;
  readonly organizationId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly runtimeOutput?: Readonly<Record<string, unknown>>;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly createId: (prefix: string) => string;
}): Promise<{
  readonly mediaArtifactIds: readonly string[];
  readonly structuredData?: unknown;
  readonly preview: string;
  readonly buildSucceeded?: boolean;
  readonly supportedDownloadFormats: readonly string[];
}> {
  const kind = input.benchmarkCase.outputKind.toLowerCase();
  const runtimeOutput = input.runtimeOutput;
  const structured = extractStructured(runtimeOutput);
  const preview = previewFromRuntime(runtimeOutput);
  const jobSummary = structured != null ? { structuredData: structured } : undefined;

  if (kind === "deferred_website" || input.benchmarkCase.service === "website") {
    const exported = await materializeWebsiteExport({
      asyncMedia: input.asyncMedia,
      executionId: input.executionId,
      organizationId: input.organizationId,
      runtimeOutput,
      jobSummary,
      metadata: input.metadata,
      createId: input.createId,
      providerId: input.providerId,
      modelId: input.modelId,
    });
    if (!exported.ok) {
      throw exported.error;
    }
    const routes = recoverWebsiteRoutesPlan(structured ?? preview) ?? [];
    const firstProject = routes[0];
    return Object.freeze({
      mediaArtifactIds: Object.freeze(exported.value.artifactIds),
      structuredData: firstProject ?? structured,
      preview: firstProject
        ? `${firstProject.title}: ${firstProject.summary}`
        : preview,
      buildSucceeded: exported.value.artifactIds.length > 0 ? true : undefined,
      supportedDownloadFormats: Object.freeze(["zip", "html"]),
    });
  }

  const exportKind = resolveDocumentExportKind({
    outputKind: input.benchmarkCase.outputKind,
    structuredName:
      typeof input.metadata.structuredOutput === "object" &&
      input.metadata.structuredOutput &&
      typeof (input.metadata.structuredOutput as { name?: unknown }).name === "string"
        ? String((input.metadata.structuredOutput as { name: string }).name)
        : undefined,
    data: structured ?? runtimeOutput,
  });

  if (exportKind) {
    const exported = await materializeDocumentExports({
      asyncMedia: input.asyncMedia,
      executionId: input.executionId,
      organizationId: input.organizationId,
      exportKind,
      runtimeOutput,
      jobSummary,
      metadata: input.metadata,
      createId: input.createId,
      providerId: input.providerId,
      modelId: input.modelId,
    });
    if (!exported.ok) {
      throw exported.error;
    }
    const formats: string[] = [];
    if (exported.value.pdfArtifactId) formats.push("pdf");
    if (exported.value.pptxArtifactId) formats.push("pptx");
    if (exported.value.docxArtifactId) formats.push("docx");
    if (exported.value.htmlArtifactId) formats.push("html");
    const plan = exported.value.plan;
    let structuredOut: unknown = structured;
    if (exportKind === "presentation") {
      structuredOut =
        recoverPresentationRoutesPayload(structured ?? runtimeOutput) ?? structured;
    }
    return Object.freeze({
      mediaArtifactIds: Object.freeze(exported.value.artifactIds),
      structuredData: structuredOut ?? plan,
      preview:
        typeof plan === "object" && plan && "title" in (plan as object)
          ? String((plan as { title: string }).title)
          : preview,
      buildSucceeded: exported.value.artifactIds.length > 0 ? true : undefined,
      supportedDownloadFormats: Object.freeze(formats),
    });
  }

  if (
    kind === "image" ||
    kind === "image_mockup" ||
    kind === "image_3d_mockup" ||
    kind === "edited_image"
  ) {
    const imageResult = await materializeSyncImageArtifacts({
      asyncMedia: input.asyncMedia,
      executionId: input.executionId,
      organizationId: input.organizationId,
      runtimeOutput: runtimeOutput ?? {},
      createId: input.createId,
      providerId: input.providerId,
      modelId: input.modelId,
      capabilityId: input.capabilityId,
    });
    if (!imageResult.ok) {
      throw imageResult.error;
    }
    return Object.freeze({
      mediaArtifactIds: Object.freeze(imageResult.value),
      structuredData: structured,
      preview: preview || "Generated image artifact",
      supportedDownloadFormats: Object.freeze(["png"]),
    });
  }

  const webProject = recoverWebProjectPlan(structured ?? preview);
  return Object.freeze({
    mediaArtifactIds: Object.freeze([]),
    structuredData: webProject ?? structured,
    preview,
    supportedDownloadFormats: Object.freeze([]),
  });
}

export async function executeBenchmarkOsPipeline(
  deps: BenchmarkOsExecutionBridgeDeps,
  input: {
    readonly benchmarkCase: BenchmarkCase;
    readonly model: BenchmarkModelTarget;
    readonly strategy: BenchmarkStrategy;
    readonly organizationId: string;
    readonly executionId: string;
  },
): Promise<BenchmarkExecutionOutput> {
  const clockMs = deps.clockMs ?? (() => Date.now());
  const createId = deps.createId ?? ((p: string) => `${p}_${Date.now()}`);
  const startMs = clockMs();
  const executableModelId = resolveExecutableModelId(
    input.model.providerId,
    input.model.modelId,
  );

  const compatibility = checkBenchmarkCompatibility({
    benchmarkCase: input.benchmarkCase,
    modelId: executableModelId,
    executionProfile: BENCHMARK_OS_EXECUTOR_PROFILE,
  });

  if (compatibility.skipExecution) {
    return Object.freeze({
      preview: "",
      latencyMs: clockMs() - startMs,
      compatibility,
      skippedPreFlight: true,
      resolvedCapabilityId: compatibility.resolvedCapabilityId,
      executionProfileId: BENCHMARK_OS_EXECUTOR_PROFILE.profileId,
    });
  }

  const metadata = buildBenchmarkOsMetadata(input);
  const request: DirectExecutionRequest = Object.freeze({
    requestId: input.executionId,
    rawPrompt: input.benchmarkCase.inputBrief,
    organizationId: asOrganizationId(input.organizationId),
    workspaceId: asWorkspaceId(deps.workspaceId ?? "ws_benchmark"),
    metadata,
  });

  const runResult = await deps.engine.run(request);
  const latencyMs = clockMs() - startMs;

  if (!runResult.ok) {
    const category = classifyExecutionFailure({ message: runResult.error.message });
    return Object.freeze({
      preview: "",
      latencyMs,
      compatibility,
      resolvedCapabilityId: compatibility.resolvedCapabilityId,
      executionProfileId: BENCHMARK_OS_EXECUTOR_PROFILE.profileId,
      operationalFailure: Object.freeze({
        category,
        message: runResult.error.message,
      }),
    });
  }

  const report = runResult.value;
  const runtimeResult = report.artifacts.runtime;
  const runtime = runtimeOutputFromResult(runtimeResult);
  const tokens = (runtimeResult?.response?.usage ?? {}) as Record<string, unknown>;

  if (!report.success || runtimeResult?.success === false) {
    const message =
      runtimeResult?.error?.message ?? "Direct execution failed";
    return Object.freeze({
      preview: previewFromRuntime(runtime),
      latencyMs,
      compatibility,
      resolvedCapabilityId: compatibility.resolvedCapabilityId,
      executionProfileId: BENCHMARK_OS_EXECUTOR_PROFILE.profileId,
      operationalFailure: Object.freeze({
        category: classifyExecutionFailure({ message }),
        message,
      }),
    });
  }

  const mediaBundle = deps.asyncMedia
    ? {
        platform: deps.asyncMedia,
        artifactsRepo: deps.artifactsRepo,
      }
    : createBenchmarkAsyncMediaPlatform();
  const asyncMedia = mediaBundle.platform;
  const artifactsRepo = mediaBundle.artifactsRepo;
  const resolvedCapability = resolveBenchmarkCapability(input.benchmarkCase);
  let materialized: Awaited<ReturnType<typeof materializeBenchmarkOsArtifacts>>;
  try {
    materialized = await materializeBenchmarkOsArtifacts({
      benchmarkCase: input.benchmarkCase,
      asyncMedia,
      executionId: input.executionId,
      organizationId: input.organizationId,
      metadata,
      runtimeOutput: runtime,
      providerId: input.model.providerId,
      modelId: executableModelId,
      capabilityId: resolvedCapability.capabilityId,
      createId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Object.freeze({
      preview: previewFromRuntime(runtime),
      structuredData: extractStructured(runtime),
      latencyMs,
      compatibility,
      resolvedCapabilityId: compatibility.resolvedCapabilityId,
      executionProfileId: BENCHMARK_OS_EXECUTOR_PROFILE.profileId,
      operationalFailure: Object.freeze({
        category: "invalid_request",
        message: `OS materialization failed: ${message}`,
      }),
    });
  }

  return Object.freeze({
    preview: materialized.preview,
    structuredData: materialized.structuredData,
    mediaArtifactIds: materialized.mediaArtifactIds,
    latencyMs,
    modelLatencyMs: latencyMs,
    inputTokens:
      typeof tokens.promptTokens === "number"
        ? tokens.promptTokens
        : typeof tokens.input_tokens === "number"
          ? tokens.input_tokens
          : undefined,
    outputTokens:
      typeof tokens.completionTokens === "number"
        ? tokens.completionTokens
        : typeof tokens.output_tokens === "number"
          ? tokens.output_tokens
          : undefined,
    compatibility,
    resolvedCapabilityId: compatibility.resolvedCapabilityId,
    executionProfileId: BENCHMARK_OS_EXECUTOR_PROFILE.profileId,
    buildSucceeded: materialized.buildSucceeded,
    supportedDownloadFormats: materialized.supportedDownloadFormats,
    benchmarkArtifactsRepo: artifactsRepo,
    benchmarkAsyncMedia: asyncMedia,
  });
}

export function shouldUseBenchmarkOsPipeline(benchmarkCase: BenchmarkCase): boolean {
  return benchmarkCaseUsesOsArtifactPipeline(benchmarkCase);
}
