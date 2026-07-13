/**
 * Placeholder human feedback analyzer.
 */

import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import { PlaceholderAnalyzer } from "./base-analyzer";

export class HumanAnalyzer extends PlaceholderAnalyzer {
  readonly analyzerId = "analyzer_human_v1";
  protected readonly signalKind = "human" as const;
  protected readonly targetTypes = ["human", "decision"] as const;

  protected scoreArtifact(snapshot: ArtifactSnapshot): number {
    const payload = snapshot.artifact.payload as Record<string, unknown>;
    return payload.feedback || payload.decision ? 0.7 : 0.3;
  }

  protected labelFor(): string {
    return "Human feedback signal";
  }
}
