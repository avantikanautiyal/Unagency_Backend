/**
 * In-memory Model Knowledge Base.
 */

import { failure, success, type Result } from "../../shared/result";
import { NotFoundError } from "../../shared/errors";
import type { ModelKnowledgeProfile } from "../contracts/knowledge";
import type { IModelKnowledgeBase } from "../interfaces/model-intelligence";

export class InMemoryModelKnowledgeBase implements IModelKnowledgeBase {
  private readonly profiles = new Map<string, ModelKnowledgeProfile>();

  constructor(initial: readonly ModelKnowledgeProfile[] = []) {
    for (const p of initial) this.profiles.set(String(p.modelId), p);
  }

  get(modelId: string): Result<ModelKnowledgeProfile> {
    const p = this.profiles.get(modelId);
    if (!p) return failure(new NotFoundError(`knowledge profile not found: ${modelId}`));
    return success(p);
  }

  list(): Result<readonly ModelKnowledgeProfile[]> {
    return success([...this.profiles.values()]);
  }

  upsert(profile: ModelKnowledgeProfile): Result<void> {
    this.profiles.set(String(profile.modelId), profile);
    return success(undefined);
  }
}
