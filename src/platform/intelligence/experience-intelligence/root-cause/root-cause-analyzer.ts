/**
 * Root cause analyzer.
 */

import { success, type Result } from "../../shared/result";
import type { RootCause } from "../contracts/root-cause";
import type { Experience } from "../contracts/experience";
import type { ExperienceIntelligenceInputs } from "../contracts/inputs";
import type { IRootCauseAnalyzer } from "../interfaces/experience-intelligence";

export class DefaultRootCauseAnalyzer implements IRootCauseAnalyzer {
  analyze(
    _inputs: ExperienceIntelligenceInputs,
    experiences: readonly Experience[]
  ): Result<readonly RootCause[]> {
    const causes = experiences.map((e) => e.rootCause);
    const unique = new Map<string, RootCause>();
    for (const cause of causes) {
      const key = cause.kind;
      const existing = unique.get(key);
      if (!existing || cause.confidence > existing.confidence) {
        unique.set(key, cause);
      }
    }
    return success([...unique.values()]);
  }
}
