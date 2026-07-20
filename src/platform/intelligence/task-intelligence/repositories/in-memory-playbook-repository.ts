/**
 * Playbook repository and matcher.
 */

import { success, failure, type Result } from "../../shared/result";
import { NotFoundError } from "../../shared/errors";
import type { ClientPlaybook } from "../contracts/playbook";
import type { TaskIntelligenceRequest } from "../contracts/request";
import type { IPlaybookRepository, IPlaybookMatcher } from "../interfaces/task-intelligence";
import { DEFAULT_PLAYBOOKS } from "../templates/playbook-seed";
import { containsAny } from "../heuristics/keyword-heuristics";

export class InMemoryPlaybookRepository implements IPlaybookRepository {
  constructor(private readonly playbooks: readonly ClientPlaybook[] = DEFAULT_PLAYBOOKS) {}

  list(): Result<readonly ClientPlaybook[]> {
    return success(this.playbooks);
  }

  get(playbookId: string): Result<ClientPlaybook> {
    const found = this.playbooks.find((p) => String(p.playbookId) === playbookId);
    if (!found) return failure(new NotFoundError(`playbook not found: ${playbookId}`));
    return success(found);
  }

  match(prompt: string, industryHint?: string): Result<ClientPlaybook | undefined> {
    if (industryHint) {
      const byIndustry = this.playbooks.find((p) => p.industry === industryHint);
      if (byIndustry) return success(byIndustry);
    }

    let best: ClientPlaybook | undefined;
    let bestScore = 0;
    for (const pb of this.playbooks) {
      const hits = pb.scenarioKeywords.filter((k) => containsAny(prompt, [k])).length;
      const score = hits / pb.scenarioKeywords.length;
      if (score > bestScore) {
        bestScore = score;
        best = pb;
      }
    }
    return success(bestScore >= 0.2 ? best : undefined);
  }
}

export class DefaultPlaybookMatcher implements IPlaybookMatcher {
  constructor(private readonly repository: IPlaybookRepository) {}

  match(request: TaskIntelligenceRequest): Result<ClientPlaybook | undefined> {
    if (request.playbookId) {
      const pb = this.repository.get(String(request.playbookId));
      return pb.ok ? success(pb.value) : success(undefined);
    }
    return this.repository.match(request.rawPrompt, request.industryHint);
  }
}
