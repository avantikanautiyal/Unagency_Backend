/**
 * Conflict resolution — pick one recommendation when experiences disagree.
 */

import { success, type Result } from "../../shared/result";
import type { Experience } from "../../experience-intelligence/contracts/experience";
import type { ExperienceId } from "../../experience-intelligence/contracts/identifiers";
import type { ConflictResolutionResult, ExperienceConflict } from "../contracts/conflict";
import type { ConflictResolutionStrategy } from "../contracts/enums";
import type { IConflictResolver } from "../interfaces/experience-injection";

const TONE_KEYWORDS = ["playful", "formal", "casual", "professional", "luxury", "tone"];

function conflictKey(experience: Experience): string | undefined {
  const text = `${experience.recommendation} ${experience.correctionStrategy.instruction}`.toLowerCase();
  for (const kw of TONE_KEYWORDS) {
    if (text.includes(kw)) return `tone:${kw}`;
  }
  if (experience.correctionStrategy.kind === "switch_provider") return "provider";
  if (experience.correctionStrategy.kind === "switch_model") return "model";
  if (experience.correctionStrategy.kind === "switch_workflow") return "workflow";
  if (experience.correctionStrategy.kind === "increase_reasoning_depth") return "reasoning_depth";
  if (experience.correctionStrategy.kind === "adjust_tone") return "tone:adjust";
  return undefined;
}

function lifecycleRank(lifecycle: string): number {
  const order: Record<string, number> = {
    preferred: 5,
    trusted: 4,
    validated: 3,
    draft: 2,
    deprecated: 1,
    archived: 0,
  };
  return order[lifecycle] ?? 0;
}

function pickWinner(
  group: Experience[],
  strategy: ConflictResolutionStrategy
): Experience {
  const sorted = [...group].sort((a, b) => {
    switch (strategy) {
      case "highest_evidence":
        return b.scores.evidenceScore - a.scores.evidenceScore;
      case "most_applicable":
        return b.scores.applicabilityScore - a.scores.applicabilityScore;
      case "most_recent":
        return b.createdAt.localeCompare(a.createdAt);
      case "prefer_trusted_lifecycle":
        return lifecycleRank(b.lifecycle) - lifecycleRank(a.lifecycle);
      case "highest_confidence":
      default:
        return b.confidence - a.confidence;
    }
  });
  return sorted[0];
}

export class DefaultConflictResolver implements IConflictResolver {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  resolve(
    experiences: readonly Experience[],
    strategy: ConflictResolutionStrategy
  ): Result<ConflictResolutionResult> {
    const groups = new Map<string, Experience[]>();
    for (const e of experiences) {
      const key = conflictKey(e);
      if (!key) continue;
      const list = groups.get(key) ?? [];
      list.push(e);
      groups.set(key, list);
    }

    // Also group opposing tones together
    const toneGroup = experiences.filter((e) => {
      const t = `${e.recommendation} ${e.correctionStrategy.instruction}`.toLowerCase();
      return t.includes("playful") || t.includes("formal");
    });
    if (toneGroup.length > 1) {
      groups.set("tone:opposing", toneGroup);
    }

    const conflicts: ExperienceConflict[] = [];
    const discarded = new Set<string>();
    const winners = new Set<string>();

    for (const [dimension, group] of groups) {
      if (group.length < 2) continue;
      const winner = pickWinner(group, strategy);
      winners.add(String(winner.experienceId));
      const losers = group
        .filter((e) => e.experienceId !== winner.experienceId)
        .map((e) => e.experienceId);
      for (const id of losers) discarded.add(String(id));

      conflicts.push(
        Object.freeze({
          conflictId: this.createId("conflict"),
          experienceIds: group.map((e) => e.experienceId),
          dimension,
          reason: `Conflicting recommendations for ${dimension}`,
          winners: [winner.experienceId] as readonly ExperienceId[],
          losers,
        })
      );
    }

    const resolved = experiences.filter((e) => !discarded.has(String(e.experienceId)));

    return success(
      Object.freeze({
        conflicts,
        resolved,
        discarded: [...discarded] as ExperienceId[],
      })
    );
  }
}
