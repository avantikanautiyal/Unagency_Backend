/**
 * Placeholder routing analyzer.
 */

import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import { PlaceholderAnalyzer } from "./base-analyzer";

export class RoutingAnalyzer extends PlaceholderAnalyzer {
  readonly analyzerId = "analyzer_routing_v1";
  protected readonly signalKind = "routing" as const;
  protected readonly targetTypes = ["execution", "capability", "policy"] as const;

  protected scoreArtifact(snapshot: ArtifactSnapshot): number {
    const capabilityId = snapshot.artifact.identity.capabilityId;
    return capabilityId ? 0.7 : 0.4;
  }

  protected labelFor(snapshot: ArtifactSnapshot): string {
    return `Routing signal from ${snapshot.artifact.type}`;
  }
}
