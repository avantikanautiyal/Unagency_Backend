/**
 * Deduplication — remove near-identical experiences.
 */

import { success, type Result } from "../../shared/result";
import type { Experience } from "../../experience-intelligence/contracts/experience";
import type { IDeduplicator } from "../interfaces/experience-injection";

function fingerprint(e: Experience): string {
  return [
    e.category,
    e.correctionStrategy.kind,
    e.recommendation.slice(0, 80).toLowerCase(),
    e.rootCause.kind,
  ].join("|");
}

export class DefaultDeduplicator implements IDeduplicator {
  deduplicate(experiences: readonly Experience[]): Result<readonly Experience[]> {
    const seen = new Map<string, Experience>();
    for (const e of experiences) {
      const key = fingerprint(e);
      const existing = seen.get(key);
      if (!existing || e.confidence > existing.confidence) {
        seen.set(key, e);
      }
    }
    return success([...seen.values()]);
  }
}
