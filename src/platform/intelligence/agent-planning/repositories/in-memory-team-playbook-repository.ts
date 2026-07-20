/**
 * Team playbook repository.
 */

import { success, type Result } from "../../shared/result";
import type { TeamPlaybook } from "../contracts/playbook";
import type { ITeamPlaybookRepository } from "../interfaces/agent-planning";
import { DEFAULT_TEAM_PLAYBOOKS } from "../playbooks/team-playbook-seed";

export class InMemoryTeamPlaybookRepository implements ITeamPlaybookRepository {
  constructor(private readonly playbooks: readonly TeamPlaybook[] = DEFAULT_TEAM_PLAYBOOKS) {}

  list(): Result<readonly TeamPlaybook[]> {
    return success(this.playbooks);
  }

  match(scenarioHint: string): Result<TeamPlaybook | undefined> {
    const lower = scenarioHint.toLowerCase();
    let best: TeamPlaybook | undefined;
    let bestScore = 0;
    for (const pb of this.playbooks) {
      const hits = pb.scenarioKeywords.filter((k) => lower.includes(k)).length;
      const score = hits / pb.scenarioKeywords.length;
      if (score > bestScore) {
        bestScore = score;
        best = pb;
      }
    }
    return success(bestScore >= 0.15 ? best : DEFAULT_TEAM_PLAYBOOKS[0]);
  }
}
