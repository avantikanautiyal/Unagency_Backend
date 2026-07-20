/**
 * Lifecycle / confidence filtering helpers.
 */

import type { Experience } from "../../experience-intelligence/contracts/experience";

export function filterByMinimumConfidence(
  experiences: readonly Experience[],
  minConfidence = 0.3
): readonly Experience[] {
  return experiences.filter((e) => e.confidence >= minConfidence);
}

export function filterDeprecated(experiences: readonly Experience[]): readonly Experience[] {
  return experiences.filter(
    (e) => e.lifecycle !== "deprecated" && e.lifecycle !== "archived"
  );
}
