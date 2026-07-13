/**
 * Placeholder memory analyzer.
 */

import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import { PlaceholderAnalyzer } from "./base-analyzer";

export class MemoryAnalyzer extends PlaceholderAnalyzer {
  readonly analyzerId = "analyzer_memory_v1";
  protected readonly signalKind = "memory" as const;
  protected readonly targetTypes = ["memory"] as const;

  protected scoreArtifact(snapshot: ArtifactSnapshot): number {
    const payload = snapshot.artifact.payload as Record<string, unknown>;
    const memory = payload.memory as Record<string, unknown> | undefined;
    const records = memory?.records;
    const count = Array.isArray(records) ? records.length : 0;
    return Math.min(1, count / 10);
  }

  protected labelFor(): string {
    return "Memory artifact density signal";
  }
}
