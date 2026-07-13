/**
 * Placeholder prompt optimizer — trims empty nodes, preserves structure.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { PromptDocument, PromptNode, PromptSection } from "../contracts/prompt-models";
import type { IPromptOptimizer } from "../interfaces/prompt-ports";

export class PromptOptimizer implements IPromptOptimizer {
  async optimize(document: PromptDocument): Promise<Result<PromptDocument>> {
    const sections: PromptSection[] = document.ast.sections.map((section) => ({
      ...section,
      nodes: section.nodes
        .map(trimNode)
        .filter((node): node is PromptNode => node !== undefined),
    }));

    return success({
      ...document,
      ast: {
        ...document.ast,
        sections,
        root: {
          ...document.ast.root,
          children: sections.map((section) => ({
            id: section.id,
            kind: "section" as const,
            role: section.role,
            children: section.nodes,
          })),
        },
      },
    });
  }
}

function trimNode(node: PromptNode): PromptNode | undefined {
  if (node.kind === "text" && !(node.text ?? "").trim()) {
    return undefined;
  }
  if (node.text) {
    return { ...node, text: node.text.trim() };
  }
  return node;
}
