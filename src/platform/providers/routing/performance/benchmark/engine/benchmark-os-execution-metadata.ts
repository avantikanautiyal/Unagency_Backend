/**
 * Step 5 — Build DirectExecution metadata from benchmark cases (mirrors create prepass).
 */

import { applyDirectPassthroughMetadata } from "../../../../../api/services/execution-thin-path";
import { stampDocumentCreateMetadata } from "../../../../../direct/document-direct-metadata";
import { stampPresentationCreateMetadata } from "../../../../../direct/presentation-direct-metadata";
import { stampEmailCreateMetadata } from "../../../../../direct/email-direct-metadata";
import { WEBSITE_ROUTES_STRUCTURED_SCHEMA } from "../../../../../os/delivery/website-generation";
import { BENCHMARK_EXECUTION_MODE } from "../contracts/benchmark-execution-config";
import type { BenchmarkCase, BenchmarkModelTarget, BenchmarkStrategy } from "../contracts/benchmark-case";
import { resolveExecutableModelId } from "../../failover/executable-model-id";

export function buildBenchmarkOsMetadata(input: {
  readonly benchmarkCase: BenchmarkCase;
  readonly model: BenchmarkModelTarget;
  readonly strategy: BenchmarkStrategy;
  readonly organizationId: string;
  readonly executionId: string;
}): Record<string, unknown> {
  const { benchmarkCase: bc, model, strategy } = input;
  const executableModelId = resolveExecutableModelId(model.providerId, model.modelId);
  const kind = bc.outputKind.toLowerCase();

  let meta: Record<string, unknown> = {
    service: bc.service,
    subtype: bc.subtype,
    outputKind: bc.outputKind,
    industry: bc.industry,
    platform: bc.platform,
    format: bc.format,
    complexity: bc.complexity,
    preferredProviderId: model.providerId,
    preferredModelId: executableModelId,
    capabilityHint: "text.generate",
    executionMode: BENCHMARK_EXECUTION_MODE,
    benchmarkId: bc.benchmarkId,
    strategyId: strategy.strategyId,
    strategyVersion: strategy.version,
    organizationId: input.organizationId,
    executionId: input.executionId,
    userBrief: bc.inputBrief,
    websiteUserBrief: bc.inputBrief,
    deliverableRequired: true,
    allowSideEffectsWithoutApproval: true,
  };

  if (kind === "deferred_website" || bc.service === "website") {
    meta.outputKind = "deferred_website";
    meta.structuredOutput = Object.freeze({
      name: "WebsiteRoutes",
      schema: WEBSITE_ROUTES_STRUCTURED_SCHEMA as unknown as Record<string, unknown>,
      strict: true,
    });
  }

  meta = stampPresentationCreateMetadata(meta);
  meta = stampDocumentCreateMetadata(meta);
  meta = stampEmailCreateMetadata(meta);
  meta = applyDirectPassthroughMetadata(meta);

  return meta;
}

export function benchmarkCaseUsesOsArtifactPipeline(benchmarkCase: BenchmarkCase): boolean {
  const kind = benchmarkCase.outputKind.toLowerCase();
  if (
    kind === "deferred_website" ||
    kind === "presentation" ||
    kind === "document" ||
    kind === "email"
  ) {
    return true;
  }
  if (
    kind === "image" ||
    kind === "image_mockup" ||
    kind === "image_3d_mockup" ||
    kind === "edited_image"
  ) {
    return true;
  }
  if (kind === "video" || kind === "animation") {
    return true;
  }
  if (benchmarkCase.service === "print") {
    return true;
  }
  return false;
}
