/**
 * Compression — top N, max context size, priority ordered, grouped by category.
 */

import { success, type Result } from "../../shared/result";
import type { Experience } from "../../experience-intelligence/contracts/experience";
import type { PrioritizationScore, RelevanceScore } from "../contracts/scoring";
import type { IExperienceCompressor } from "../interfaces/experience-injection";

export class DefaultExperienceCompressor implements IExperienceCompressor {
  compress(
    experiences: readonly Experience[],
    _scores: readonly RelevanceScore[],
    priorities: readonly PrioritizationScore[],
    topN: number,
    maxItems: number
  ): Result<readonly Experience[]> {
    const limit = Math.min(topN, maxItems, experiences.length);
    const byId = new Map(experiences.map((e) => [String(e.experienceId), e]));
    const ordered = priorities
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map((p) => byId.get(String(p.experienceId)))
      .filter((e): e is Experience => e !== undefined);

    // Diversify: prefer at most ~half from same category when overflowing
    const selected: Experience[] = [];
    const categoryCount = new Map<string, number>();
    const maxPerCategory = Math.max(2, Math.ceil(limit / 3));

    for (const e of ordered) {
      if (selected.length >= limit) break;
      const count = categoryCount.get(e.category) ?? 0;
      if (count >= maxPerCategory) continue;
      selected.push(e);
      categoryCount.set(e.category, count + 1);
    }

    // Fill remaining slots if category caps left gaps
    if (selected.length < limit) {
      for (const e of ordered) {
        if (selected.length >= limit) break;
        if (!selected.some((s) => s.experienceId === e.experienceId)) {
          selected.push(e);
        }
      }
    }

    return success(selected);
  }
}
