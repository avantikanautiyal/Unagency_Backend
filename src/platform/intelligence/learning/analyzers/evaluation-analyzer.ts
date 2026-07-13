/**
 * Placeholder evaluation analyzer.
 */

import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import { PlaceholderAnalyzer } from "./base-analyzer";

export class EvaluationAnalyzer extends PlaceholderAnalyzer {
  readonly analyzerId = "analyzer_evaluation_v1";
  protected readonly signalKind = "evaluation" as const;
  protected readonly targetTypes = ["evaluation"] as const;

  protected scoreArtifact(snapshot: ArtifactSnapshot): number {
    const payload = snapshot.artifact.payload as Record<string, unknown>;
    const evaluation = payload.evaluation as Record<string, unknown> | undefined;
    const summary = evaluation?.summary as Record<string, unknown> | undefined;
    if (summary?.passed === false) return 0.2;
    return typeof summary?.overallScore === "number" ? summary.overallScore : 0.5;
  }

  protected labelFor(): string {
    return "Evaluation outcome signal";
  }
}
