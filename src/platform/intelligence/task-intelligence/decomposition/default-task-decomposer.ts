/**
 * Task decomposer — expands playbook or capability map into task nodes.
 */

import { success, type Result } from "../../shared/result";
import { asCapabilityId } from "../../shared/identifiers";
import { asTaskNodeId } from "../contracts/identifiers";
import type { TaskNode } from "../contracts/task";
import type { CapabilityMap } from "../contracts/capability";
import type { ClientPlaybook } from "../contracts/playbook";
import type { ITaskDecomposer } from "../interfaces/task-intelligence";

export class DefaultTaskDecomposer implements ITaskDecomposer {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  decompose(
    prompt: string,
    capabilityMap: CapabilityMap,
    playbook?: ClientPlaybook
  ): Result<readonly TaskNode[]> {
    if (playbook) {
      return success(playbook.tasks.map((t) => this.fromTemplate(t)));
    }

    const nodes: TaskNode[] = [];
    const ids: string[] = [];

    for (let i = 0; i < capabilityMap.requirements.length; i++) {
      const req = capabilityMap.requirements[i];
      const nodeId = asTaskNodeId(this.createId(`node_${i}`));
      ids.push(String(nodeId));
      nodes.push({
        nodeId,
        title: req.label,
        description: `${req.label} for: ${prompt.slice(0, 80)}`,
        taskType: i === 0 ? "strategic" : "creative",
        nodeKind: req.label.toLowerCase().includes("review") ? "review_gate" : "task",
        capabilityId: req.capabilityId,
        complexity: i < 3 ? "moderate" : "simple",
        priority: i < 4 ? "high" : "normal",
        stage: Math.floor(i / 3) + 1,
        dependsOn: i > 0 ? [asTaskNodeId(ids[i - 1])] : [],
        deliverableIds: [],
        requiresReview:
          req.label.toLowerCase().includes("review") ||
          req.label.toLowerCase().includes("strategy"),
        optional: false,
      });
    }

    return success(nodes);
  }

  private fromTemplate(t: ClientPlaybook["tasks"][number]): TaskNode {
    return {
      nodeId: asTaskNodeId(t.templateId),
      title: t.title,
      description: t.description,
      taskType: t.stage <= 2 ? "strategic" : "creative",
      nodeKind: t.requiresReview ? "review_gate" : "task",
      capabilityId: asCapabilityId(t.capabilityId),
      complexity: t.stage <= 2 ? "moderate" : "simple",
      priority: t.stage <= 2 ? "high" : "normal",
      stage: t.stage,
      parallelGroup: t.parallelGroup,
      dependsOn: t.dependsOn.map((d) => asTaskNodeId(d)),
      deliverableIds: [],
      requiresReview: t.requiresReview,
      optional: t.optional,
    };
  }
}
