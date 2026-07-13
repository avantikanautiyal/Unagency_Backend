/**
 * Context enrichment stage ports.
 */

import type { Result } from "../../shared/result";
import type { ContextBuildRequest } from "../contracts/context-build-request";
import type { IntelligenceContext } from "../contracts/intelligence-context";

export type ContextEnrichmentStageName =
  | "base"
  | "organization"
  | "workspace"
  | "brand"
  | "capability"
  | "execution"
  | "security"
  | "assets"
  | "final";

/**
 * Partial context being enriched — mutable only within enrichment pipeline.
 */
export type MutableIntelligenceContext = {
  -readonly [K in keyof IntelligenceContext]?: IntelligenceContext[K];
};

export interface IContextEnrichmentStage {
  readonly name: ContextEnrichmentStageName;
  enrich(
    request: ContextBuildRequest,
    draft: MutableIntelligenceContext
  ): Promise<Result<MutableIntelligenceContext>>;
}

export interface IContextEnrichmentPipeline {
  enrich(
    request: ContextBuildRequest,
    draft: MutableIntelligenceContext
  ): Promise<Result<MutableIntelligenceContext>>;
}
