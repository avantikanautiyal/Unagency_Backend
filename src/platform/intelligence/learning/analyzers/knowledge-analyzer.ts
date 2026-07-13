/**
 * Placeholder knowledge analyzer.
 */

import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import { PlaceholderAnalyzer } from "./base-analyzer";

export class KnowledgeAnalyzer extends PlaceholderAnalyzer {
  readonly analyzerId = "analyzer_knowledge_v1";
  protected readonly signalKind = "knowledge" as const;
  protected readonly targetTypes = ["knowledge"] as const;

  protected scoreArtifact(snapshot: ArtifactSnapshot): number {
    const payload = snapshot.artifact.payload as Record<string, unknown>;
    const knowledge = payload.knowledge as Record<string, unknown> | undefined;
    const items = knowledge?.items;
    return Array.isArray(items) && items.length > 0 ? 0.75 : 0.45;
  }

  protected labelFor(): string {
    return "Knowledge coverage signal";
  }
}
