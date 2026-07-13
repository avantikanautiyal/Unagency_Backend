/**
 * Placeholder workflow analyzer.
 */

import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import { PlaceholderAnalyzer } from "./base-analyzer";

export class WorkflowAnalyzer extends PlaceholderAnalyzer {
  readonly analyzerId = "analyzer_workflow_v1";
  protected readonly signalKind = "workflow" as const;
  protected readonly targetTypes = ["workflow"] as const;

  protected scoreArtifact(snapshot: ArtifactSnapshot): number {
    const payload = snapshot.artifact.payload as Record<string, unknown>;
    return payload.workflow ? 0.65 : 0.35;
  }

  protected labelFor(): string {
    return "Workflow execution signal";
  }
}
