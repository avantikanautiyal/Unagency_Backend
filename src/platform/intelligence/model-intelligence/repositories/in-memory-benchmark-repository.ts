/**
 * Benchmark repository — heuristic placeholder scores from model attributes.
 */

import { failure, success, type Result } from "../../shared/result";
import { NotFoundError } from "../../shared/errors";
import type { CanonicalModel } from "../../model-registry/contracts/model";
import type { BenchmarkCategory, BenchmarkScore, ModelBenchmarkRecord } from "../contracts/benchmark";
import { asCanonicalModelId } from "../../model-registry/contracts/identifiers";
import type { IBenchmarkRepository } from "../interfaces/model-intelligence";

const ALL_CATEGORIES: BenchmarkCategory[] = [
  "reasoning", "coding", "creative_writing", "marketing", "brand_copy", "seo",
  "research", "math", "vision", "ocr", "image_understanding", "image_generation",
  "video_understanding", "video_generation", "translation", "summarization",
  "planning", "tool_calling", "function_calling", "structured_output",
  "conversation", "long_context", "agent_tasks", "multimodal_tasks", "audio", "speech",
];

function scoreCategory(model: CanonicalModel, category: BenchmarkCategory): number {
  const q = { frontier: 0.95, premium: 0.85, standard: 0.7, economy: 0.55 }[model.qualityTier] ?? 0.65;
  const boosts: Partial<Record<BenchmarkCategory, number>> = {
    reasoning: model.flags.reasoning ? 0.12 : 0,
    coding: model.departments.includes("coding" as never) ? 0.1 : 0,
    creative_writing: model.departments.includes("creative" as never) ? 0.1 : 0,
    marketing: model.departments.includes("general" as never) ? 0.08 : 0,
    vision: model.flags.vision ? 0.12 : -0.2,
    image_generation: model.flags.imageGeneration ? 0.15 : -0.3,
    tool_calling: model.flags.functionCalling ? 0.1 : -0.1,
    structured_output: model.flags.structuredOutput ? 0.1 : -0.05,
    long_context: model.limits.maximumContext > 100000 ? 0.1 : 0,
  };
  const boost = boosts[category] ?? 0;
  const latencyPenalty = model.latencyTier === "high" ? -0.05 : 0;
  return Math.min(0.99, Math.max(0.1, q + boost + latencyPenalty));
}

export function buildBenchmarkRecord(
  model: CanonicalModel,
  nowIso: string = new Date().toISOString()
): ModelBenchmarkRecord {
  const benchmarks: BenchmarkScore[] = ALL_CATEGORIES.map((category) => ({
    category,
    score: scoreCategory(model, category),
    maxScore: 1,
    measuredAt: nowIso,
  }));
  const aggregateScore =
    benchmarks.reduce((s, b) => s + b.score, 0) / benchmarks.length;

  return {
    modelId: asCanonicalModelId(String(model.modelId)),
    benchmarks,
    aggregateScore,
    computedAt: nowIso,
  };
}

export class InMemoryBenchmarkRepository implements IBenchmarkRepository {
  private readonly records = new Map<string, ModelBenchmarkRecord>();

  constructor(models: readonly CanonicalModel[] = [], nowIso?: () => string) {
    const now = nowIso ?? (() => new Date().toISOString());
    for (const m of models) {
      const rec = buildBenchmarkRecord(m, now());
      this.records.set(String(m.modelId), rec);
    }
  }

  get(modelId: string): Result<ModelBenchmarkRecord> {
    const r = this.records.get(modelId);
    if (!r) return failure(new NotFoundError(`benchmark not found: ${modelId}`));
    return success(r);
  }

  list(): Result<readonly ModelBenchmarkRecord[]> {
    return success([...this.records.values()]);
  }

  forCategory(category: BenchmarkCategory): Result<readonly ModelBenchmarkRecord[]> {
    return success(
      [...this.records.values()].sort((a, b) => {
        const sa = a.benchmarks.find((x) => x.category === category)?.score ?? 0;
        const sb = b.benchmarks.find((x) => x.category === category)?.score ?? 0;
        return sb - sa;
      })
    );
  }
}
