/**
 * Infer capability metadata from discovered OpenAI model ids.
 * Inventory still comes from discovery — this only enriches attributes.
 */

import type { DiscoveredOpenAIModel } from "../contracts/openai-contracts";

export function enrichDiscoveredModel(
  raw: Readonly<Record<string, unknown>>
): DiscoveredOpenAIModel {
  const id = String(raw.id ?? "");
  const lower = id.toLowerCase();

  const isEmbedding = lower.includes("embedding");
  const isImage = lower.includes("dall-e") || lower.includes("image");
  const isAudio =
    lower.includes("whisper") ||
    lower.includes("tts") ||
    lower.includes("audio") ||
    lower.includes("speech");
  const isReasoning = /^o\d/.test(lower) || lower.includes("o1") || lower.includes("o3");
  const isVision =
    lower.includes("gpt-4o") ||
    lower.includes("gpt-4.1") ||
    lower.includes("vision") ||
    lower.includes("4o");
  const isChat = !isEmbedding && !isImage && !isAudio;

  const contextWindow = estimateContextWindow(lower);
  const lifecycle =
    lower.includes("preview") || lower.includes("alpha")
      ? "preview"
      : lower.includes("instruct") || lower.endsWith("-0314")
        ? "legacy"
        : "active";

  return Object.freeze({
    id,
    ownedBy: raw.owned_by ? String(raw.owned_by) : undefined,
    created: typeof raw.created === "number" ? raw.created : undefined,
    modalities: Object.freeze(
      [
        isChat ? "text" : undefined,
        isVision ? "image" : undefined,
        isAudio ? "audio" : undefined,
        isEmbedding ? "embedding" : undefined,
        isImage ? "image" : undefined,
      ].filter(Boolean) as string[]
    ),
    capability: Object.freeze({
      streaming: isChat && !isReasoning,
      toolCalling: isChat && !lower.includes("instruct"),
      vision: isVision,
      audio: isAudio,
      embeddings: isEmbedding,
      reasoning: isReasoning,
      structuredOutputs: isChat,
      jsonMode: isChat,
      contextWindow,
      maxOutputTokens: isReasoning ? 100_000 : 16_384,
    }),
    pricing: Object.freeze(estimatePricing(lower)),
    lifecycle,
    releaseDate:
      typeof raw.created === "number"
        ? new Date(raw.created * 1000).toISOString()
        : undefined,
    raw,
  });
}

function estimateContextWindow(id: string): number {
  if (id.includes("o1") || id.includes("gpt-4.1")) return 200_000;
  if (id.includes("gpt-4o") || id.includes("gpt-4-turbo")) return 128_000;
  if (id.includes("embedding-3-large")) return 8_192;
  if (id.includes("embedding")) return 8_192;
  return 128_000;
}

function estimatePricing(id: string): { inputPerMillion?: number; outputPerMillion?: number } {
  if (id.includes("mini")) return { inputPerMillion: 0.15, outputPerMillion: 0.6 };
  if (id.includes("o1")) return { inputPerMillion: 15, outputPerMillion: 60 };
  if (id.includes("embedding-3-small")) return { inputPerMillion: 0.02 };
  if (id.includes("embedding")) return { inputPerMillion: 0.13 };
  return { inputPerMillion: 2.5, outputPerMillion: 10 };
}
