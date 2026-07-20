/**
 * In-memory benchmark evidence store — feeds Learning / Evaluation / Model Intelligence consumers.
 */

import type { BenchmarkExecutionEvidence } from "../contracts";
import type { IBenchmarkEvidenceStore } from "../interfaces";

export class InMemoryBenchmarkEvidenceStore implements IBenchmarkEvidenceStore {
  private readonly items: BenchmarkExecutionEvidence[] = [];

  add(evidence: BenchmarkExecutionEvidence): void {
    this.items.push(evidence);
  }

  list(): readonly BenchmarkExecutionEvidence[] {
    return this.items;
  }

  get(evidenceId: string): BenchmarkExecutionEvidence | undefined {
    return this.items.find((e) => e.evidenceId === evidenceId);
  }

  clear(): void {
    this.items.length = 0;
  }
}
