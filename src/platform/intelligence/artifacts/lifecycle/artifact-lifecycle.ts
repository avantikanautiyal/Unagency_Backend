/**
 * Artifact lifecycle transitions — immutable state machine.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { Artifact, ArtifactLifecycleState } from "../contracts/artifact-models";
import { ArtifactLifecycleError } from "../errors";
import type { IArtifactLifecycleManager } from "../interfaces/artifact-ports";

const TRANSITIONS: Readonly<Record<ArtifactLifecycleState, readonly ArtifactLifecycleState[]>> = {
  created: ["validated", "deleted"],
  validated: ["published", "deleted"],
  published: ["superseded", "archived", "deleted"],
  superseded: ["archived", "deleted"],
  archived: ["deleted"],
  deleted: [],
};

export function canTransitionArtifactLifecycle(
  from: ArtifactLifecycleState,
  to: ArtifactLifecycleState
): boolean {
  return TRANSITIONS[from].includes(to);
}

export class ArtifactLifecycleManager implements IArtifactLifecycleManager {
  canTransition(from: ArtifactLifecycleState, to: ArtifactLifecycleState): boolean {
    return canTransitionArtifactLifecycle(from, to);
  }

  transition(artifact: Artifact, to: ArtifactLifecycleState): Result<Artifact> {
    if (!this.canTransition(artifact.lifecycle, to)) {
      return {
        ok: false,
        error: new ArtifactLifecycleError(
          `Invalid lifecycle transition: ${artifact.lifecycle} → ${to}`,
          { artifactId: artifact.identity.artifactId, from: artifact.lifecycle, to }
        ),
      };
    }
    return success({ ...artifact, lifecycle: to });
  }
}
