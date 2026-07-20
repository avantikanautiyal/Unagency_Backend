/**
 * Experience recommendation builder from experiences.
 */

import type { Experience } from "../contracts/experience";

export interface ExperienceRecommendation {
  readonly recommendationId: string;
  readonly experienceId: string;
  readonly title: string;
  readonly description: string;
  readonly priority: "high" | "medium" | "low";
  readonly advisoryOnly: true;
}

export function buildRecommendations(
  experiences: readonly Experience[],
  createId: (prefix: string) => string = (p) => `${p}_1`
): ExperienceRecommendation[] {
  return experiences.map((exp) =>
    Object.freeze({
      recommendationId: createId("rec"),
      experienceId: String(exp.experienceId),
      title: exp.recommendation,
      description: exp.correctionStrategy.instruction,
      priority: exp.correctionStrategy.priority,
      advisoryOnly: true as const,
    })
  );
}
