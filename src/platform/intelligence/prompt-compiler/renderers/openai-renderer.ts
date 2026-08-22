/**
 * OpenAI Chat Completions renderer.
 *
 * Maps compiled PromptDocument sections to OpenAI message roles:
 *   system   → system
 *   user     → user
 *   assistant → assistant
 *   everything else → user (safe fallback)
 *
 * Sections are ordered by PromptSection.order and collapsed into a
 * message array compatible with the OpenAI Chat Completions API.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { PromptDocument, PromptSectionRole } from "../contracts/prompt-models";
import type {
  CompiledPromptMessageView,
  IPromptRenderer,
} from "../interfaces/prompt-ports";

type OpenAIRole = "system" | "user" | "assistant";

function toOpenAIRole(role: PromptSectionRole): OpenAIRole {
  if (role === "system") return "system";
  if (role === "output") return "assistant";
  return "user";
}

export class OpenAIPromptRenderer implements IPromptRenderer {
  readonly name = "openai";
  readonly target = "openai" as const;

  async render(
    document: PromptDocument
  ): Promise<Result<CompiledPromptMessageView>> {
    // Sort by declared order, then collapse adjacent messages with the same role
    const sorted = [...document.ast.sections].sort((a, b) => a.order - b.order);

    const messages: Array<{ role: OpenAIRole; content: string }> = [];
    for (const section of sorted) {
      const content = section.nodes.map((n) => n.text ?? "").join("\n").trim();
      if (!content) continue;

      const role = toOpenAIRole(section.role);
      const prev = messages[messages.length - 1];
      if (prev && prev.role === role) {
        // Collapse adjacent same-role sections to avoid OpenAI role alternation issues
        prev.content = `${prev.content}\n\n${content}`;
      } else {
        messages.push({ role, content });
      }
    }

    // OpenAI requires at least one message
    if (messages.length === 0) {
      messages.push({ role: "user", content: "" });
    }

    return success({
      format: "openai.messages.v1",
      payload: { messages },
    });
  }
}
