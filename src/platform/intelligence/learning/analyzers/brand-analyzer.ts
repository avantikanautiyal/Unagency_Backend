/**
 * Placeholder brand analyzer.
 */

import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import { PlaceholderAnalyzer } from "./base-analyzer";

export class BrandAnalyzer extends PlaceholderAnalyzer {
  readonly analyzerId = "analyzer_brand_v1";
  protected readonly signalKind = "brand" as const;
  protected readonly targetTypes = ["brand", "context", "prompt"] as const;

  protected scoreArtifact(snapshot: ArtifactSnapshot): number {
    const tags = snapshot.artifact.metadata.tags ?? [];
    return tags.includes("brand") ? 0.85 : 0.6;
  }

  protected labelFor(): string {
    return "Brand alignment signal";
  }
}
