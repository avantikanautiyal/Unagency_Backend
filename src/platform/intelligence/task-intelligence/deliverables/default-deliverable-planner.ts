/**
 * Deliverable planner.
 */

import { success, type Result } from "../../shared/result";
import { asDeliverableId } from "../contracts/identifiers";
import type { DeliverablePlan, DeliverableItem } from "../contracts/deliverable";
import type { TaskNode } from "../contracts/task";
import type { IDeliverablePlanner } from "../interfaces/task-intelligence";

export class DefaultDeliverablePlanner implements IDeliverablePlanner {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  plan(prompt: string, nodes: readonly TaskNode[]): Result<DeliverablePlan> {
    const carousel = nodes.find((n) => n.title.toLowerCase().includes("carousel"));
    const items: DeliverableItem[] = nodes
      .filter((n) => n.nodeKind === "task" || n.nodeKind === "review_gate")
      .map((n) => ({
        deliverableId: asDeliverableId(this.createId(`del_${n.nodeId}`)),
        name: n.title,
        format: inferFormat(n.title),
        quantity: n.title.toLowerCase().includes("carousel") ? 7 : undefined,
        description: n.description,
        checklist: buildChecklist(n.title),
      }));

    return success({
      planId: this.createId("del_plan"),
      primaryDeliverable: carousel?.title ?? nodes[0]?.title ?? "Task Output",
      items,
      publishingNotes: carousel
        ? ["Schedule during peak engagement hours", "Cross-post to Stories"]
        : ["Review before publish"],
      reviewChecklist: [
        "Brand guidelines compliance",
        "Tone and voice alignment",
        "Legal/compliance review if required",
        "CTA clarity",
      ],
      rationale: `Deliverables derived from ${nodes.length} task nodes for: ${prompt.slice(0, 60)}`,
    });
  }
}

function inferFormat(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("carousel")) return "7 slides + caption + hashtags + CTA + image prompts";
  if (t.includes("reel")) return "video script + storyboard";
  if (t.includes("email")) return "email sequence";
  if (t.includes("landing")) return "landing page copy";
  if (t.includes("seo")) return "metadata bundle";
  return "document";
}

function buildChecklist(title: string): string[] {
  const base = ["Accuracy", "Brand consistency"];
  if (title.toLowerCase().includes("carousel")) {
    return [...base, "7 slides", "Caption", "Hashtags", "CTA", "Image prompts", "Publishing notes"];
  }
  return base;
}
