/**
 * Placeholder provider analyzer.
 */

import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import { PlaceholderAnalyzer } from "./base-analyzer";

export class ProviderAnalyzer extends PlaceholderAnalyzer {
  readonly analyzerId = "analyzer_provider_v1";
  protected readonly signalKind = "provider" as const;
  protected readonly targetTypes = ["provider_request", "provider_response"] as const;

  protected scoreArtifact(snapshot: ArtifactSnapshot): number {
    const payload = snapshot.artifact.payload as Record<string, unknown>;
    return payload.providerId ? 0.75 : 0.5;
  }

  protected labelFor(snapshot: ArtifactSnapshot): string {
    return `Provider signal from ${snapshot.artifact.type}`;
  }
}
