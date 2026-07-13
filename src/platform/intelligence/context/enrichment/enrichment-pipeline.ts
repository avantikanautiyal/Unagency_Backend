/**
 * Context enrichment pipeline — independently replaceable stages.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { ContextBuildRequest } from "../contracts/context-build-request";
import type {
  IContextEnrichmentPipeline,
  IContextEnrichmentStage,
  MutableIntelligenceContext,
} from "../interfaces/enrichment";

export class ContextEnrichmentPipeline implements IContextEnrichmentPipeline {
  constructor(private readonly stages: readonly IContextEnrichmentStage[]) {}

  async enrich(
    request: ContextBuildRequest,
    draft: MutableIntelligenceContext
  ): Promise<Result<MutableIntelligenceContext>> {
    let current = draft;
    for (const stage of this.stages) {
      const result = await stage.enrich(request, current);
      if (!result.ok) {
        return result;
      }
      current = result.value;
    }
    return success(current);
  }
}

/**
 * Passthrough enrichment stage — placeholder for future data sources.
 */
export class PassthroughEnrichmentStage implements IContextEnrichmentStage {
  constructor(readonly name: IContextEnrichmentStage["name"]) {}

  async enrich(
    _request: ContextBuildRequest,
    draft: MutableIntelligenceContext
  ): Promise<Result<MutableIntelligenceContext>> {
    return success(draft);
  }
}

export function createDefaultEnrichmentPipeline(): ContextEnrichmentPipeline {
  return new ContextEnrichmentPipeline([
    new PassthroughEnrichmentStage("base"),
    new PassthroughEnrichmentStage("organization"),
    new PassthroughEnrichmentStage("workspace"),
    new PassthroughEnrichmentStage("brand"),
    new PassthroughEnrichmentStage("capability"),
    new PassthroughEnrichmentStage("execution"),
    new PassthroughEnrichmentStage("security"),
    new PassthroughEnrichmentStage("assets"),
    new PassthroughEnrichmentStage("final"),
  ]);
}
