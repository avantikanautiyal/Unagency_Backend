/**
 * Anthropic wire → canonical response mapping.
 */

import type {
  ProviderAdapterRequest,
  ProviderWirePayload,
  ProviderAdapterResponse,
} from "../../adapters/contracts/adapter-io";
import type { CanonicalFinishReason } from "../../adapters/contracts/enums";
import {
  parsePresentationRoutes,
  recoverPresentationRoutesPayload,
} from "../../../os/delivery/document-export-service";
import { recoverWebsiteRoutesPlan } from "../../../os/delivery/website-generation";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** True when tool input (or recovered near-miss) is exportable PresentationRoutes. */
function toolInputHasExportableRoutes(input: unknown): boolean {
  if (input == null) return false;
  const recovered = recoverPresentationRoutesPayload(input);
  return parsePresentationRoutes(recovered) != null;
}

/** True when tool input is exportable WebsiteRoutes / WebProject. */
function toolInputHasExportableWebsite(input: unknown): boolean {
  if (input == null) return false;
  return Boolean(recoverWebsiteRoutesPlan(input)?.length);
}

function toolInputHasExportableStructured(input: unknown): boolean {
  return (
    toolInputHasExportableRoutes(input) || toolInputHasExportableWebsite(input)
  );
}

function textBlocksJoined(
  contentBlocks: Array<Record<string, unknown>> | undefined
): string {
  if (!contentBlocks?.length) return "";
  return contentBlocks
    .map((block) => (block.type === "text" ? String(block.text ?? "") : ""))
    .join("")
    .trim();
}

function extractAnthropicText(
  contentBlocks: Array<Record<string, unknown>> | undefined
): string {
  if (!contentBlocks?.length) return "";

  const textFromBlocks = textBlocksJoined(contentBlocks);
  const toolBlock = contentBlocks.find((block) => block.type === "tool_use");
  if (toolBlock && toolBlock.input != null) {
    if (toolInputHasExportableStructured(toolBlock.input)) {
      return typeof toolBlock.input === "string"
        ? toolBlock.input
        : JSON.stringify(toolBlock.input);
    }
    // Incomplete/empty tool_use payloads must not hide valid JSON in text blocks.
    if (textFromBlocks) return textFromBlocks;
    return typeof toolBlock.input === "string"
      ? toolBlock.input
      : JSON.stringify(toolBlock.input);
  }

  return textFromBlocks;
}

export function mapAnthropicResponseToCanonical(
  raw: ProviderWirePayload,
  request: ProviderAdapterRequest,
  latencyMs: number,
  nowIso: string
): ProviderAdapterResponse {
  const contentBlocks = raw.content as Array<Record<string, unknown>> | undefined;
  const text = extractAnthropicText(contentBlocks);
  const toolBlock = contentBlocks?.find((block) => block.type === "tool_use");
  const structuredFromTool =
    toolBlock &&
    toolBlock.input != null &&
    isRecord(toolBlock.input) &&
    toolInputHasExportableStructured(toolBlock.input)
      ? (toolBlock.input as Record<string, unknown>)
      : undefined;

  const structuredFromText = (() => {
    if (structuredFromTool || !text.trim()) return undefined;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (isRecord(parsed) && toolInputHasExportableStructured(parsed)) {
        return parsed;
      }
    } catch {
      /* not JSON */
    }
    return undefined;
  })();

  const structured = structuredFromTool ?? structuredFromText;

  const usage = (raw.usage as Record<string, unknown>) ?? {};
  const stopReason = String(raw.stop_reason ?? "end_turn");

  return Object.freeze({
    requestId: request.requestId,
    providerId: request.providerId,
    adapterId: request.adapterId,
    modelId: request.modelId,
    output: Object.freeze({
      content: text,
      ...(structured ? { structured } : {}),
      ...(stopReason ? { finishReason: mapFinishReason(stopReason) } : {}),
    }),
    finishReason: mapFinishReason(stopReason),
    usage: Object.freeze({
      promptTokens: numberOrUndef(usage.input_tokens),
      completionTokens: numberOrUndef(usage.output_tokens),
      totalTokens:
        numberOrUndef(usage.input_tokens) !== undefined &&
        numberOrUndef(usage.output_tokens) !== undefined
          ? (usage.input_tokens as number) + (usage.output_tokens as number)
          : undefined,
    }),
    latencyMs,
    warnings: [],
    safety: [],
    streamed: Boolean(request.streaming),
    createdAt: nowIso,
  });
}

function mapFinishReason(finish: string): CanonicalFinishReason {
  switch (finish) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_call";
    default:
      return "unknown";
  }
}

function numberOrUndef(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
