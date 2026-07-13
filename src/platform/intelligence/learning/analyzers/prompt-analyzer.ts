/**
 * Placeholder prompt analyzer.
 */

import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import { PlaceholderAnalyzer } from "./base-analyzer";

export class PromptAnalyzer extends PlaceholderAnalyzer {
  readonly analyzerId = "analyzer_prompt_v1";
  protected readonly signalKind = "prompt" as const;
  protected readonly targetTypes = ["prompt"] as const;

  protected scoreArtifact(snapshot: ArtifactSnapshot): number {
    const payload = snapshot.artifact.payload as Record<string, unknown>;
    return payload.prompt ? 0.8 : 0.4;
  }

  protected labelFor(): string {
    return "Prompt compilation signal";
  }
}
