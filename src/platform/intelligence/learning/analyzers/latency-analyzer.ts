/**
 * Placeholder latency analyzer.
 */

import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import { PlaceholderAnalyzer, clamp01 } from "./base-analyzer";

export class LatencyAnalyzer extends PlaceholderAnalyzer {
  readonly analyzerId = "analyzer_latency_v1";
  protected readonly signalKind = "latency" as const;
  protected readonly targetTypes = ["execution", "provider_response"] as const;

  protected scoreArtifact(snapshot: ArtifactSnapshot): number {
    const attrs = snapshot.artifact.metadata.attributes ?? {};
    const latencyMs = typeof attrs.latencyMs === "number" ? attrs.latencyMs : 500;
    return clamp01(1 - latencyMs / 5000);
  }

  protected labelFor(): string {
    return "Latency performance signal";
  }
}
