/**
 * Base analyzer utilities for placeholder learning analysis.
 */

import { randomUUID } from "crypto";
import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import type {
  LearningSignal,
  LearningSignalKind,
} from "../contracts/learning-models";
import type { AnalyzerContext, IAnalyzer } from "../interfaces/learning-ports";

export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function artifactsOfType(
  artifacts: readonly ArtifactSnapshot[],
  type: ArtifactSnapshot["artifact"]["type"]
): ArtifactSnapshot[] {
  return artifacts.filter((a) => a.artifact.type === type);
}

export function buildSignal(
  kind: LearningSignalKind,
  snapshot: ArtifactSnapshot,
  value: number,
  label: string
): LearningSignal {
  return {
    signalId: `lsig_${randomUUID()}`,
    kind,
    sourceArtifactId: snapshot.artifact.identity.artifactId,
    sourceArtifactType: snapshot.artifact.type,
    value,
    normalizedValue: clamp01(value),
    label,
    extractedAt: new Date().toISOString(),
  };
}

export abstract class PlaceholderAnalyzer implements IAnalyzer {
  abstract readonly analyzerId: string;
  protected abstract readonly signalKind: LearningSignalKind;
  protected abstract readonly targetTypes: readonly ArtifactSnapshot["artifact"]["type"][];

  protected abstract scoreArtifact(snapshot: ArtifactSnapshot): number;
  protected abstract labelFor(snapshot: ArtifactSnapshot): string;

  async analyze(context: AnalyzerContext): Promise<Result<readonly LearningSignal[]>> {
    const signals: LearningSignal[] = [];
    for (const snapshot of context.artifacts) {
      if (!this.targetTypes.includes(snapshot.artifact.type)) continue;
      signals.push(
        buildSignal(
          this.signalKind,
          snapshot,
          this.scoreArtifact(snapshot),
          this.labelFor(snapshot)
        )
      );
    }
    return success(signals);
  }
}
