/**
 * Resolves available knowledge sources for a request.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  KnowledgeRequest,
  KnowledgeSource,
} from "../contracts/knowledge-models";
import type {
  IKnowledgeSource,
  IKnowledgeSourceResolver,
} from "../interfaces/knowledge-ports";

export class KnowledgeSourceResolver implements IKnowledgeSourceResolver {
  constructor(private readonly sources: readonly IKnowledgeSource[]) {}

  async resolve(
    request: KnowledgeRequest
  ): Promise<Result<readonly KnowledgeSource[]>> {
    const allowedKinds = request.sourceKinds
      ? new Set(request.sourceKinds)
      : undefined;

    const candidates: KnowledgeSource[] = [];
    for (const source of this.sources) {
      if (allowedKinds && !allowedKinds.has(source.kind)) {
        continue;
      }
      const available = await source.isAvailable();
      candidates.push({
        id: source.id,
        kind: source.kind,
        name: source.name,
        available,
      });
    }

    return success(candidates.filter((s) => s.available));
  }
}
