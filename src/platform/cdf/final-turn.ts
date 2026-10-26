/**
 * CDF final-step turn (server) — what a message typed after the creative was
 * approved means: a change to it, one of the final buttons, another size, a
 * new project, or a question. Never mutates CDF sessions.
 *
 * Keyword matching sent "can you make the exact creative in lighter mode?" to
 * the generic conversation path ("Which deliverable…?"), and the follow-up
 * "apply it to the approved version" was taken as a new brief. The model sees
 * the recent turns, so a follow-up carries the earlier request with it.
 */

import type { IDirectExecutionEngine } from "../direct/contracts";
import { asOrganizationId, asWorkspaceId } from "../core/identifiers";
import { normalizeSchemaForOpenAiStrict } from "../providers/tools/structured/structured-output-execution";
import { applyDirectPassthroughMetadata } from "../api/services/execution-thin-path";

export const CDF_FINAL_TURN_INTENTS = [
  "refine",
  "final_action",
  "size",
  "new_project",
  "question",
  "unclear",
] as const;
export type CdfFinalTurnIntent = (typeof CDF_FINAL_TURN_INTENTS)[number];

export type CdfFinalTurnRequest = {
  readonly text: string;
  readonly finalActions: readonly string[];
  readonly deliverableLabel?: string;
  /** Last few chat turns, oldest first. */
  readonly recentTurns?: readonly { readonly from: "user" | "ai"; readonly text: string }[];
};

export type CdfFinalTurnResponse = {
  readonly intent: CdfFinalTurnIntent;
  /** Exact final action label for intent=final_action. */
  readonly finalAction?: string;
  /** Self-contained change to apply for intent=refine (merges earlier turns). */
  readonly instruction?: string;
  /** Short answer for intent=question/unclear. */
  readonly reply?: string;
  readonly source: "llm" | "llm_unavailable";
};

const SCHEMA = normalizeSchemaForOpenAiStrict({
  type: "object",
  properties: {
    intent: { type: "string", enum: [...CDF_FINAL_TURN_INTENTS] },
    finalAction: { type: "string" },
    instruction: { type: "string" },
    reply: { type: "string" },
  },
  required: ["intent", "finalAction", "instruction", "reply"],
  additionalProperties: false,
});

const LLM_PROVIDERS = [
  { providerId: "provider.openai", modelId: "gpt-4o-mini" },
  { providerId: "provider.gemini", modelId: "gemini-2.5-flash" },
] as const;

function buildPrompt(r: CdfFinalTurnRequest): string {
  const deliverable = r.deliverableLabel?.trim() || "creative";
  const turns = (r.recentTurns ?? [])
    .slice(-6)
    .map((t) => `${t.from === "user" ? "User" : "Assistant"}: ${t.text.slice(0, 300)}`)
    .join("\n");
  return [
    `A creative-production assistant has finished the user's ${deliverable}: it is approved and shown on screen.`,
    `Buttons available now: ${r.finalActions.length ? r.finalActions.map((a) => `"${a}"`).join(", ") : "(none)"}.`,
    "Classify the user's LATEST message. It may be in any language, mixed languages, or broken English.",
    "",
    'intent:',
    '- "refine": wants any change to the approved creative — colours, light/dark mode, text or copy, layout, element sizes, style, mood, adding/removing something ("make it lighter", "same but in blue", "can you change the headline"). Also a follow-up that only says WHERE to apply an earlier change ("apply it to the approved version", "do it on this one").',
    '- "final_action": asks for one of the buttons (download, save to vault, generate angles, send to studio…). Put the button\'s exact label in finalAction.',
    '- "size": wants the creative in another size, ratio or format (story, 16:9, 1080x1920).',
    '- "new_project": wants a different, unrelated creative or a fresh start.',
    '- "question": a question, thanks or small talk with no change requested.',
    '- "unclear": cannot be interpreted.',
    'When the message describes any change to what exists, choose "refine".',
    "",
    'instruction (only for "refine"): the complete change to apply, in plain English, written so it stands alone — merge in the earlier user request when the latest message only refers to it. Otherwise "".',
    'reply (only for "question" / "unclear"): one or two short, friendly sentences answering it and saying what the user can do next. Otherwise "".',
    'finalAction: the exact button label for "final_action", otherwise "".',
    "",
    turns ? `Recent conversation:\n${turns}\n` : "",
    `Latest message:\n${r.text.slice(0, 500)}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function parseStructured(
  output: Record<string, unknown> | undefined,
  finalActions: readonly string[],
): Omit<CdfFinalTurnResponse, "source"> | null {
  if (!output) return null;
  let parsed: Record<string, unknown> | null = null;
  if (output.structured && typeof output.structured === "object") {
    parsed = output.structured as Record<string, unknown>;
  } else {
    const text =
      typeof output.content === "string"
        ? output.content
        : typeof output.text === "string"
          ? output.text
          : "";
    const match = text.trim().match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }
  }
  if (!parsed) return null;
  const intent = String(parsed.intent ?? "").trim() as CdfFinalTurnIntent;
  if (!CDF_FINAL_TURN_INTENTS.includes(intent)) return null;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const label = str(parsed.finalAction);
  const finalAction = finalActions.find((a) => a.toLowerCase() === label.toLowerCase());
  // A button the user can't press is not an answer.
  if (intent === "final_action" && !finalAction) return null;
  return {
    intent,
    ...(finalAction && intent === "final_action" ? { finalAction } : {}),
    ...(intent === "refine" && str(parsed.instruction) ? { instruction: str(parsed.instruction) } : {}),
    ...((intent === "question" || intent === "unclear") && str(parsed.reply)
      ? { reply: str(parsed.reply) }
      : {}),
  };
}

export async function classifyCdfFinalTurn(input: {
  readonly request: CdfFinalTurnRequest;
  readonly organizationId: string;
  readonly integration?: IDirectExecutionEngine;
  readonly createId?: (prefix: string) => string;
}): Promise<CdfFinalTurnResponse> {
  const text = String(input.request.text ?? "").trim();
  const finalActions = (input.request.finalActions ?? []).map(String);
  let result: CdfFinalTurnResponse = { intent: "unclear", source: "llm_unavailable" };
  if (text && input.integration && input.organizationId.trim()) {
    const prompt = buildPrompt({ ...input.request, text, finalActions });
    for (const provider of LLM_PROVIDERS) {
      const requestId = (input.createId ?? ((p) => `${p}_${Date.now()}`))("cdf_final_turn");
      try {
        const run = await input.integration.run({
          requestId,
          rawPrompt: prompt,
          organizationId: asOrganizationId(input.organizationId),
          workspaceId: asWorkspaceId("ws_default"),
          correlationId: requestId,
          mode: "direct_provider" as never,
          metadata: applyDirectPassthroughMetadata({
            skipOutputRequirements: true,
            productAction: "cdf_final_turn_classify",
            preferredProviderId: provider.providerId,
            preferredModelId: provider.modelId,
            providerId: provider.providerId,
            modelId: provider.modelId,
            capabilityId: "text.generate",
            structuredOutput: { name: "cdf_final_turn", schema: SCHEMA, strict: true },
          }),
        });
        if (!run.ok || run.value.success === false) continue;
        const output = run.value.artifacts.runtime?.response?.output as
          | Record<string, unknown>
          | undefined;
        const parsed = parseStructured(output, finalActions);
        if (parsed) {
          result = { ...parsed, source: "llm" };
          break;
        }
      } catch {
        continue;
      }
    }
  }
  console.info(
    JSON.stringify({
      scope: "cdf.final_turn",
      event: "turn_classified",
      intent: result.intent,
      finalAction: result.finalAction ?? null,
      source: result.source,
      organizationId: input.organizationId,
      textPreview: text.slice(0, 60),
      ts: new Date().toISOString(),
    }),
  );
  return result;
}
