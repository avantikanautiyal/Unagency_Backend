/**
 * Generate refinement MCQ questions via direct AI provider call.
 */

import type { RefinementQuestion } from "../../os/refinement/contracts/refinement-question";
import type { RefinementOutputType } from "../../os/refinement/contracts/refinement-request";
import type { FeedbackAnswer } from "../../os/refinement/contracts/feedback-session";
import type { IDirectExecutionEngine } from "../../direct/contracts";
import {
  asOrganizationId,
  asWorkspaceId,
} from "../../core/identifiers";
import { normalizeSchemaForOpenAiStrict } from "../../providers/tools/structured/structured-output-execution";
import {
  answeredIdSet,
  selectNextQuestionId,
} from "../../os/refinement/questions/adaptive-selector";
import { createDefaultQuestionBank } from "../../os/refinement/questions/question-bank";
import { applyDirectPassthroughMetadata } from "../../api/services/execution-thin-path";

const REFINEMENT_QUESTION_SCHEMA = normalizeSchemaForOpenAiStrict({
  type: "object",
  properties: {
    questionId: { type: "string" },
    dimension: { type: "string" },
    question: { type: "string" },
    selectionType: { type: "string", enum: ["single", "multi"] },
    required: { type: "boolean" },
    options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          optionId: { type: "string" },
          label: { type: "string" },
          value: { type: "string" },
          refinementSignal: { type: "string" },
        },
        required: ["optionId", "label", "value", "refinementSignal"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "questionId",
    "dimension",
    "question",
    "selectionType",
    "required",
    "options",
  ],
  additionalProperties: false,
});

/** Prefer OpenAI, then Anthropic/Gemini when OpenAI is rate-limited / circuit-open. */
const REFINE_QUESTION_PROVIDERS = [
  { providerId: "provider.openai", modelId: "gpt-4o-mini" },
  { providerId: "provider.anthropic", modelId: "claude-sonnet-4-5" },
  { providerId: "provider.gemini", modelId: "gemini-2.5-flash" },
] as const;

function extractTextFromRuntime(
  runtime: import("../../providers/runtime/contracts/provider-execution-response").ProviderExecutionResult | undefined
): string {
  const output = runtime?.response?.output as Record<string, unknown> | undefined;
  if (!output) return "";
  if (output.structured && typeof output.structured === "object") {
    return JSON.stringify(output.structured);
  }
  if (typeof output.content === "string") return output.content;
  if (typeof output.text === "string") return output.text;
  if (typeof output.message === "string") return output.message;
  return JSON.stringify(output);
}

function parseQuestionJson(raw: string, fallbackId: string): RefinementQuestion | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const options = Array.isArray(parsed.options)
      ? parsed.options.map((o, i) => {
          const opt = o as Record<string, unknown>;
          return {
            optionId: String(opt.optionId ?? `opt_${i}`),
            label: String(opt.label ?? `Option ${i + 1}`),
            value: String(opt.value ?? opt.optionId ?? `opt_${i}`),
            refinementSignal: String(
              opt.refinementSignal ?? `${parsed.dimension ?? "general"}.${opt.value ?? i}`
            ),
          };
        })
      : [];
    if (!options.length) return null;
    return {
      questionId: String(parsed.questionId ?? fallbackId),
      outputType: "*",
      dimension: String(parsed.dimension ?? "general"),
      question: String(parsed.question ?? "How would you like to refine this?"),
      required: parsed.required !== false,
      selectionType:
        parsed.selectionType === "multi" ? "multi" : "single",
      options,
    };
  } catch {
    return null;
  }
}

function bankFallbackQuestion(input: {
  readonly outputType: RefinementOutputType;
  readonly questionNumber: number;
  readonly priorAnswers?: readonly FeedbackAnswer[];
  readonly createId: (prefix: string) => string;
}): RefinementQuestion {
  const bank = createDefaultQuestionBank();
  if (input.questionNumber <= 1 || !input.priorAnswers?.length) {
    return bank.rootFor(input.outputType);
  }
  const answered = answeredIdSet(input.priorAnswers);
  const last = input.priorAnswers[input.priorAnswers.length - 1]!;
  const current = bank.get(last.questionId);
  if (current) {
    const nextId = selectNextQuestionId(
      current,
      last.optionIds,
      bank,
      answered,
      input.priorAnswers
    );
    const next = nextId ? bank.get(nextId) : undefined;
    if (next) return next;
  }
  // Last resort — still more useful than the 4 generic tone/visual/copy chips.
  return {
    ...bank.rootFor(input.outputType),
    questionId: input.createId("refine_q_bank"),
  };
}

export function generateDeterministicRefinementQuestion(input: {
  readonly outputType: RefinementOutputType;
  readonly questionNumber: number;
  readonly priorAnswers?: readonly FeedbackAnswer[];
  readonly createId: (prefix: string) => string;
}): RefinementQuestion {
  return bankFallbackQuestion(input);
}

export async function generateAiRefinementQuestion(input: {
  readonly integration: IDirectExecutionEngine;
  readonly organizationId: string;
  readonly executionId: string;
  readonly outputType: RefinementOutputType;
  readonly sourcePreview?: string;
  readonly questionNumber: number;
  readonly maxQuestions: number;
  readonly priorAnswers?: readonly FeedbackAnswer[];
  readonly createId: (prefix: string) => string;
}): Promise<RefinementQuestion> {
  const priorSummary =
    input.priorAnswers?.length ?
      input.priorAnswers
        .map(
          (a) =>
            `- ${a.dimension}: ${a.values.join(", ")}${a.otherText ? ` (${a.otherText})` : ""}`
        )
        .join("\n")
    : "(none yet)";

  const prompt = [
    "You are helping a user refine a creative deliverable they already selected.",
    `Output type: ${input.outputType}`,
    input.sourcePreview
      ? `Current output / locked creative context:\n${input.sourcePreview.slice(0, 1200)}`
      : "",
    `This is refinement question ${input.questionNumber} of up to ${input.maxQuestions}.`,
    `Prior answers:\n${priorSummary}`,
    "",
    "Generate ONE multiple-choice refinement question tailored to THIS creative and prior answers.",
    "Do NOT ask generic questions like \"What would you like to change?\" — be specific to the deliverable.",
    "Return ONLY valid JSON with this shape:",
    JSON.stringify(
      {
        questionId: "string",
        dimension: "string",
        question: "string",
        selectionType: "single|multi",
        required: true,
        options: [
          {
            optionId: "string",
            label: "string",
            value: "string",
            refinementSignal: "string",
          },
        ],
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Ask about tone, visual direction, layout, copy, colors, or specific changes relevant to the creative.",
    "- Provide 3-5 concrete options plus an 'Other' option (value must be \"other\").",
    "- Each option needs optionId, label, value, refinementSignal.",
    "- Return ONLY valid JSON, no markdown.",
  ]
    .filter(Boolean)
    .join("\n");

  let lastError = "unknown";
  for (const provider of REFINE_QUESTION_PROVIDERS) {
    const requestId = input.createId("refine_q");
    try {
      const result = await input.integration.run({
        requestId,
        rawPrompt: prompt,
        organizationId: asOrganizationId(input.organizationId),
        workspaceId: asWorkspaceId("ws_default"),
        correlationId: requestId,
        mode: "direct_provider" as never,
        metadata: applyDirectPassthroughMetadata({
          skipOutputRequirements: true,
          productAction: "refine_question",
          preferredProviderId: provider.providerId,
          preferredModelId: provider.modelId,
          providerId: provider.providerId,
          modelId: provider.modelId,
          capabilityId: "text.generate",
          structuredOutput: {
            name: "refinement_question",
            schema: REFINEMENT_QUESTION_SCHEMA,
            strict: true,
          },
        }),
      });

      if (!result.ok) {
        lastError = String(result.error.message);
        continue;
      }
      if (result.value.success === false) {
        const runtime = result.value.artifacts.runtime;
        lastError =
          runtime?.error?.message ??
          result.value.trace?.stages?.find((s) => s.status === "failed")?.message ??
          "provider execution failed";
        // Still try to parse if the model returned content despite a soft failure.
        const softText = extractTextFromRuntime(runtime);
        const softParsed = softText
          ? parseQuestionJson(softText, input.createId("refine_q"))
          : null;
        if (softParsed) return softParsed;
        continue;
      }

      const text = extractTextFromRuntime(result.value.artifacts.runtime);
      const parsed = parseQuestionJson(text, input.createId("refine_q"));
      if (parsed) return parsed;
      lastError = "could not parse structured refinement question";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  console.warn(
    `[refinement] AI question generation failed (q${input.questionNumber}): ${lastError} — using output-aware question bank`
  );
  return bankFallbackQuestion({
    outputType: input.outputType,
    questionNumber: input.questionNumber,
    priorAnswers: input.priorAnswers,
    createId: input.createId,
  });
}
