/**
 * Placeholder cost analyzer.
 */

import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import { PlaceholderAnalyzer, clamp01 } from "./base-analyzer";

export class CostAnalyzer extends PlaceholderAnalyzer {
  readonly analyzerId = "analyzer_cost_v1";
  protected readonly signalKind = "cost" as const;
  protected readonly targetTypes = [
    "provider_request",
    "provider_response",
    "execution",
  ] as const;

  protected scoreArtifact(snapshot: ArtifactSnapshot): number {
    const attrs = snapshot.artifact.metadata.attributes ?? {};
    const cost = typeof attrs.cost === "number" ? attrs.cost : 0.5;
    return clamp01(cost);
  }

  protected labelFor(): string {
    return "Cost utilization signal";
  }
}
