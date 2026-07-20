/**
 * Performance repository — placeholder latency/reliability.
 */

import { success, type Result } from "../../shared/result";
import type { CanonicalModel } from "../../model-registry/contracts/model";
import type { IPerformanceRepository } from "../interfaces/model-intelligence";

const LATENCY_MS: Record<string, number> = {
  ultra_low: 200,
  low: 500,
  medium: 1200,
  high: 2500,
};

export class InMemoryPerformanceRepository implements IPerformanceRepository {
  private readonly models = new Map<string, CanonicalModel>();

  constructor(models: readonly CanonicalModel[] = []) {
    for (const m of models) this.models.set(String(m.modelId), m);
  }

  getReliability(modelId: string): Result<number> {
    const m = this.models.get(modelId);
    const base = m?.availability === "available" ? 0.92 : 0.7;
    const tierBoost = m?.qualityTier === "frontier" ? 0.05 : 0;
    return success(Math.min(0.99, base + tierBoost));
  }

  getLatencyMs(modelId: string): Result<number> {
    const m = this.models.get(modelId);
    const tier = m?.latencyTier ?? "medium";
    return success(LATENCY_MS[tier] ?? 1000);
  }
}
