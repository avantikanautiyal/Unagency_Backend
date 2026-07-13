/**
 * Neutral renderer — provider-independent message view.
 * OpenAI/Claude/Gemini renderers are intentionally not implemented.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { PromptDocument } from "../contracts/prompt-models";
import type {
  CompiledPromptMessageView,
  IPromptRenderer,
} from "../interfaces/prompt-ports";

export class NeutralPromptRenderer implements IPromptRenderer {
  readonly name = "neutral";
  readonly target = "neutral" as const;

  async render(
    document: PromptDocument
  ): Promise<Result<CompiledPromptMessageView>> {
    const messages = document.ast.sections.map((section) => ({
      role: section.role,
      content: section.nodes.map((n) => n.text ?? "").join("\n").trim(),
      order: section.order,
    }));

    return success({
      format: "neutral.messages.v1",
      payload: { messages },
    });
  }
}
