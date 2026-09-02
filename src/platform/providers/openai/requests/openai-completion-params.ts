/**
 * Normalize OpenAI chat completion token limit fields on wire bodies.
 */

function wireModelId(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) return trimmed;
  return trimmed.includes("/") ? (trimmed.split("/").pop() ?? trimmed) : trimmed;
}

/** Reasoning / GPT-5 family models reject legacy max_tokens. */
export function openAiUsesMaxCompletionTokens(modelId: string): boolean {
  const m = wireModelId(modelId).toLowerCase();
  if (m.startsWith("gpt-5")) return true;
  if (/^o[134]/.test(m)) return true;
  if (m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4-mini")) {
    return true;
  }
  return false;
}

/**
 * Strip internal camelCase and map token limits to the field OpenAI accepts.
 * OpenAI returns 400 when both max_tokens and max_completion_tokens are sent.
 */
export function normalizeOpenAiCompletionTokenParams(
  body: Record<string, unknown>,
  modelId: string
): void {
  const limit =
    typeof body.max_completion_tokens === "number"
      ? body.max_completion_tokens
      : typeof body.max_tokens === "number"
        ? body.max_tokens
        : typeof body.maxTokens === "number"
          ? body.maxTokens
          : undefined;

  delete body.maxTokens;

  if (limit == null) {
    delete body.max_tokens;
    delete body.max_completion_tokens;
    return;
  }

  if (openAiUsesMaxCompletionTokens(modelId)) {
    body.max_completion_tokens = limit;
    delete body.max_tokens;
  } else {
    body.max_tokens = limit;
    delete body.max_completion_tokens;
  }
}
