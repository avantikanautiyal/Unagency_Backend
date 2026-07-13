/**
 * Prompt parser — template body → PromptAST.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  PromptAST,
  PromptNode,
  PromptSection,
  PromptSectionRole,
  PromptTemplate,
} from "../contracts/prompt-models";
import type { IPromptParser } from "../interfaces/prompt-ports";

const SECTION_PREFIX: Record<string, PromptSectionRole> = {
  SYSTEM: "system",
  IDENTITY: "identity",
  BRAND: "brand",
  CAPABILITY: "capability",
  KNOWLEDGE: "knowledge",
  INSTRUCTIONS: "instructions",
  USER: "user",
  OUTPUT: "output",
};

export class PromptParser implements IPromptParser {
  async parse(template: PromptTemplate): Promise<Result<PromptAST>> {
    const lines = template.body.split("\n");
    const sections: PromptSection[] = [];
    let order = 0;
    let currentRole: PromptSectionRole = "system";
    let currentNodes: PromptNode[] = [];
    let sectionIndex = 0;

    const flush = () => {
      if (currentNodes.length === 0) return;
      sections.push({
        id: `section_${sectionIndex++}`,
        role: currentRole,
        nodes: currentNodes,
        order: order++,
      });
      currentNodes = [];
    };

    for (const [lineIndex, line] of lines.entries()) {
      const match = /^([A-Z]+):\s?(.*)$/.exec(line);
      if (match && SECTION_PREFIX[match[1]!]) {
        flush();
        currentRole = SECTION_PREFIX[match[1]!]!;
        const text = match[2] ?? "";
        currentNodes = text
          ? [textNode(`n_${lineIndex}`, text, currentRole)]
          : [];
        continue;
      }
      currentNodes.push(textNode(`n_${lineIndex}`, line, currentRole));
    }
    flush();

    const root: PromptNode = {
      id: "root",
      kind: "document",
      children: sections.map((section) => ({
        id: section.id,
        kind: "section",
        role: section.role,
        children: section.nodes,
      })),
    };

    return success({
      root,
      sections,
      variables: template.variables,
      constraints: template.constraints,
    });
  }
}

function textNode(
  id: string,
  text: string,
  role: PromptSectionRole
): PromptNode {
  const variableMatch = /\{\{([^}]+)\}\}/.exec(text);
  if (variableMatch && text.trim() === `{{${variableMatch[1]}}}`) {
    return {
      id,
      kind: "variable",
      role,
      variableName: variableMatch[1]!.trim(),
      text,
    };
  }
  return {
    id,
    kind: "text",
    role,
    text,
  };
}
