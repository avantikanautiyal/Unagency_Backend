/**
 * Placeholder quality analyzer.
 */

import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import { PlaceholderAnalyzer } from "./base-analyzer";

export class QualityAnalyzer extends PlaceholderAnalyzer {
  readonly analyzerId = "analyzer_quality_v1";
  protected readonly signalKind = "quality" as const;
  protected readonly targetTypes = ["execution", "evaluation"] as const;

  protected scoreArtifact(snapshot: ArtifactSnapshot): number {
    if (snapshot.artifact.type === "evaluation") {
      const payload = snapshot.artifact.payload as Record<string, unknown>;
      const evaluation = payload.evaluation as Record<string, unknown> | undefined;
      const summary = evaluation?.summary as Record<string, unknown> | undefined;
      return typeof summary?.overallScore === "number" ? summary.overallScore : 0.5;
    }
    const payload = snapshot.artifact.payload as Record<string, unknown>;
    const execution = payload.execution as Record<string, unknown> | undefined;
    return execution?.success === true ? 0.8 : 0.3;
  }

  protected labelFor(snapshot: ArtifactSnapshot): string {
    return `Quality signal from ${snapshot.artifact.type}`;
  }
}
