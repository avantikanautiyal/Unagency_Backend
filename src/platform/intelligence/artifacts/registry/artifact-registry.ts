/**
 * In-memory artifact type registry.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  ArtifactDescriptor,
  ArtifactRegistryEntry,
  ArtifactType,
} from "../contracts/artifact-models";
import { ArtifactNotFoundError, ArtifactValidationError } from "../errors";
import type { IArtifactRegistry } from "../interfaces/artifact-ports";

const DEFAULT_DESCRIPTORS: readonly ArtifactDescriptor[] = [
  descriptor("context", "ContextArtifact", "context"),
  descriptor("knowledge", "KnowledgeArtifact", "knowledge"),
  descriptor("prompt", "PromptArtifact", "prompt"),
  descriptor("provider_request", "ProviderRequestArtifact", "request"),
  descriptor("provider_response", "ProviderResponseArtifact", "response"),
  descriptor("execution", "ExecutionArtifact", "execution"),
  descriptor("evaluation", "EvaluationArtifact", "evaluation"),
  descriptor("memory", "MemoryArtifact", "memory"),
  descriptor("learning", "LearningArtifact", "signal"),
  descriptor("workflow", "WorkflowArtifact", "workflow"),
  descriptor("decision", "DecisionArtifact", "decision"),
  descriptor("human", "HumanArtifact", "feedback"),
  descriptor("brand", "BrandArtifact", "brand"),
  descriptor("capability", "CapabilityArtifact", "capability"),
  descriptor("policy", "PolicyArtifact", "policy"),
];

function descriptor(
  type: ArtifactType,
  displayName: string,
  payloadKey: string
): ArtifactDescriptor {
  return {
    type,
    schemaVersion: "1.0.0",
    displayName,
    payloadKey,
    supportsVersioning: true,
    supportsLineage: true,
  };
}

export class InMemoryArtifactRegistry implements IArtifactRegistry {
  private readonly entries = new Map<ArtifactType, ArtifactRegistryEntry>();

  constructor(seedDefaults = true) {
    if (seedDefaults) {
      for (const d of DEFAULT_DESCRIPTORS) {
        this.register(d);
      }
    }
  }

  register(descriptor: ArtifactDescriptor): Result<ArtifactRegistryEntry> {
    if (!descriptor.type || !descriptor.displayName) {
      return failure(new ArtifactValidationError("descriptor type and displayName required"));
    }
    const entry: ArtifactRegistryEntry = {
      descriptor,
      registeredAt: new Date().toISOString(),
      isActive: true,
    };
    this.entries.set(descriptor.type, entry);
    return success(entry);
  }

  resolve(type: ArtifactType): Result<ArtifactDescriptor> {
    const entry = this.entries.get(type);
    if (!entry || !entry.isActive) {
      return failure(new ArtifactNotFoundError(`Artifact type not registered: ${type}`));
    }
    return success(entry.descriptor);
  }

  list(): readonly ArtifactRegistryEntry[] {
    return [...this.entries.values()];
  }
}
