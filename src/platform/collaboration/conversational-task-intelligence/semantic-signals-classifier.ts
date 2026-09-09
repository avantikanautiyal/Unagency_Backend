/**
 * Multilingual conversational semantic signals — closed schema via LLM.
 * Authority for turn-control meaning (approve / refine / select route / export / …).
 * Regex heuristics are fallback only when LLM is off or unavailable.
 */

import type { IDirectExecutionEngine } from "../../direct/contracts";
import {
  asOrganizationId,
  asWorkspaceId,
} from "../../core/identifiers";
import { normalizeSchemaForOpenAiStrict } from "../../providers/tools/structured/structured-output-execution";
import { applyDirectPassthroughMetadata } from "../../api/services/execution-thin-path";
import {
  extractSemanticSignals,
  type SemanticSignals,
} from "./semantic-signals";

export type SemanticSignalsSource = "llm" | "heuristic_fallback";

export type ClassifiedSemanticSignals = SemanticSignals & {
  readonly source: SemanticSignalsSource;
  readonly confidence: number;
  /** True when this is a full new brief (not a vague edit of a prior deliverable). */
  readonly isSubstantiveNewGeneration: boolean;
};

export type SemanticLlmRollout = "off" | "auto" | "on";

export function resolveSemanticLlmRollout(
  env: NodeJS.ProcessEnv = process.env
): SemanticLlmRollout {
  const raw = env.CTI_SEMANTIC_LLM?.trim().toLowerCase();
  if (raw === "off" || raw === "auto" || raw === "on") return raw;
  return "on";
}

const EXPORT_FORMATS = ["pdf", "pptx", "docx", "html", "zip"] as const;
const QUANTITY_HINTS = ["single", "multiple"] as const;
const ARTIFACT_TYPES = [
  "website",
  "image",
  "presentation",
  "document",
  "email",
  "video",
  "social",
] as const;

const SIGNAL_SCHEMA = normalizeSchemaForOpenAiStrict({
  type: "object",
  properties: {
    isQuestion: { type: "boolean" },
    isImperative: { type: "boolean" },
    isFeedback: { type: "boolean" },
    isApproval: { type: "boolean" },
    isRejection: { type: "boolean" },
    isContinuation: { type: "boolean" },
    isVariation: { type: "boolean" },
    isModification: { type: "boolean" },
    isRemoval: { type: "boolean" },
    isReplacement: { type: "boolean" },
    isReversion: { type: "boolean" },
    isComparison: { type: "boolean" },
    isExplanation: { type: "boolean" },
    isSummarization: { type: "boolean" },
    isTransformation: { type: "boolean" },
    isTaskSwitch: { type: "boolean" },
    isReset: { type: "boolean" },
    isSelection: { type: "boolean" },
    isCreation: { type: "boolean" },
    isRegeneration: { type: "boolean" },
    isExport: { type: "boolean" },
    exportFormat: { type: "string", enum: [...EXPORT_FORMATS, ""] },
    hasDeicticReference: { type: "boolean" },
    referencesExistingResult: { type: "boolean" },
    isAssetExtraction: { type: "boolean" },
    isDeliveryRequest: { type: "boolean" },
    hasOrdinalReference: { type: "boolean" },
    hasVersionReference: { type: "boolean" },
    hasSuperlativeReference: { type: "boolean" },
    persistentScope: { type: "boolean" },
    temporaryScope: { type: "boolean" },
    mentionsArtifactType: { type: "string", enum: [...ARTIFACT_TYPES, ""] },
    quantityHint: { type: "string", enum: [...QUANTITY_HINTS, ""] },
    isSubstantiveNewGeneration: { type: "boolean" },
    confidence: { type: "number" },
  },
  required: [
    "isQuestion",
    "isImperative",
    "isFeedback",
    "isApproval",
    "isRejection",
    "isContinuation",
    "isVariation",
    "isModification",
    "isRemoval",
    "isReplacement",
    "isReversion",
    "isComparison",
    "isExplanation",
    "isSummarization",
    "isTransformation",
    "isTaskSwitch",
    "isReset",
    "isSelection",
    "isCreation",
    "isRegeneration",
    "isExport",
    "exportFormat",
    "hasDeicticReference",
    "referencesExistingResult",
    "isAssetExtraction",
    "isDeliveryRequest",
    "hasOrdinalReference",
    "hasVersionReference",
    "hasSuperlativeReference",
    "persistentScope",
    "temporaryScope",
    "mentionsArtifactType",
    "quantityHint",
    "isSubstantiveNewGeneration",
    "confidence",
  ],
  additionalProperties: false,
});

const LLM_PROVIDERS = [
  { providerId: "provider.openai", modelId: "gpt-4o-mini" },
  { providerId: "provider.anthropic", modelId: "claude-haiku-4-5" },
  { providerId: "provider.gemini", modelId: "gemini-2.5-flash" },
] as const;

function asBool(value: unknown): boolean {
  return value === true;
}

function asExportFormat(
  value: unknown
): SemanticSignals["exportFormat"] | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  return (EXPORT_FORMATS as readonly string[]).includes(v)
    ? (v as SemanticSignals["exportFormat"])
    : undefined;
}

function asQuantityHint(
  value: unknown
): SemanticSignals["quantityHint"] | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  return (QUANTITY_HINTS as readonly string[]).includes(v)
    ? (v as SemanticSignals["quantityHint"])
    : undefined;
}

function asArtifactType(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  return (ARTIFACT_TYPES as readonly string[]).includes(v) ? v : undefined;
}

function extractStructured(
  runtime: import("../../providers/runtime/contracts/provider-execution-response").ProviderExecutionResult | undefined
): Record<string, unknown> | null {
  const output = runtime?.response?.output as Record<string, unknown> | undefined;
  if (!output) return null;
  if (output.structured && typeof output.structured === "object") {
    return output.structured as Record<string, unknown>;
  }
  const text =
    typeof output.content === "string"
      ? output.content
      : typeof output.text === "string"
        ? output.text
        : "";
  const match = text.trim().match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mapLlmSignals(
  parsed: Record<string, unknown>
): ClassifiedSemanticSignals | null {
  const exportFormat = asExportFormat(parsed.exportFormat);
  const quantityHint = asQuantityHint(parsed.quantityHint);
  const mentionsArtifactType = asArtifactType(parsed.mentionsArtifactType);
  const confidenceRaw =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? parsed.confidence
      : 0.7;
  const confidence = Math.max(0, Math.min(1, confidenceRaw));

  return Object.freeze({
    isQuestion: asBool(parsed.isQuestion),
    isImperative: asBool(parsed.isImperative),
    isFeedback: asBool(parsed.isFeedback),
    isApproval: asBool(parsed.isApproval),
    isRejection: asBool(parsed.isRejection),
    isContinuation: asBool(parsed.isContinuation),
    isVariation: asBool(parsed.isVariation),
    isModification: asBool(parsed.isModification),
    isRemoval: asBool(parsed.isRemoval),
    isReplacement: asBool(parsed.isReplacement),
    isReversion: asBool(parsed.isReversion),
    isComparison: asBool(parsed.isComparison),
    isExplanation: asBool(parsed.isExplanation),
    isSummarization: asBool(parsed.isSummarization),
    isTransformation: asBool(parsed.isTransformation),
    isTaskSwitch: asBool(parsed.isTaskSwitch),
    isReset: asBool(parsed.isReset),
    isSelection: asBool(parsed.isSelection),
    isCreation: asBool(parsed.isCreation),
    isRegeneration: asBool(parsed.isRegeneration),
    isExport: asBool(parsed.isExport),
    ...(exportFormat ? { exportFormat } : {}),
    hasDeicticReference: asBool(parsed.hasDeicticReference),
    referencesExistingResult: asBool(parsed.referencesExistingResult),
    isAssetExtraction: asBool(parsed.isAssetExtraction),
    isDeliveryRequest: asBool(parsed.isDeliveryRequest),
    hasOrdinalReference: asBool(parsed.hasOrdinalReference),
    hasVersionReference: asBool(parsed.hasVersionReference),
    hasSuperlativeReference: asBool(parsed.hasSuperlativeReference),
    persistentScope: asBool(parsed.persistentScope),
    temporaryScope: asBool(parsed.temporaryScope),
    ...(mentionsArtifactType ? { mentionsArtifactType } : {}),
    ...(quantityHint ? { quantityHint } : {}),
    isSubstantiveNewGeneration: asBool(parsed.isSubstantiveNewGeneration),
    confidence,
    source: "llm" as const,
  });
}

function heuristicFallback(text: string): ClassifiedSemanticSignals {
  const base = extractSemanticSignals(text);
  const trimmed = text.trim();
  const isSubstantiveNewGeneration =
    base.isCreation && trimmed.length >= 48
      ? true
      : trimmed.length >= 96 && Boolean(base.mentionsArtifactType);
  return Object.freeze({
    ...base,
    isSubstantiveNewGeneration,
    confidence: 0.35,
    source: "heuristic_fallback" as const,
  });
}

/**
 * Classify conversational meaning for a user turn.
 * Message may be any language / mixed / informal. Falls back to heuristics when LLM unavailable.
 */
export async function classifySemanticSignals(input: {
  readonly message: string;
  readonly integration?: IDirectExecutionEngine;
  readonly organizationId?: string;
  readonly createId?: (prefix: string) => string;
  readonly rollout?: SemanticLlmRollout;
  readonly hasActiveDeliverable?: boolean;
}): Promise<ClassifiedSemanticSignals> {
  const message = input.message.trim();
  if (!message) return heuristicFallback("");

  const rollout = input.rollout ?? resolveSemanticLlmRollout();
  if (
    rollout === "off" ||
    !input.integration ||
    !input.organizationId?.trim() ||
    message.length < 1
  ) {
    return heuristicFallback(message);
  }

  // auto: skip LLM for tiny acknowledgements when a deliverable is active (cheap path)
  if (rollout === "auto" && message.length < 3) {
    return heuristicFallback(message);
  }

  const id = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
  const llmPrompt = [
    "Classify the user's conversational intent for a creative-agency chat product.",
    "The message may be in any language, mixed languages (e.g. Hinglish), or broken English.",
    "Interpret meaning — do not rely on English keywords alone.",
    "Return JSON only matching the schema.",
    "",
    "Flag meanings (set true only when clearly applicable):",
    "- isApproval / isRejection: short confirm/deny of a proposal (not creative constraints like \"no red\").",
    "- isModification / isRemoval / isReplacement / isReversion: edit an existing result.",
    "- isCreation: ask to make something new (not editing a prior deliverable).",
    "- isRegeneration: retry / regenerate / redo an existing deliverable.",
    "- isVariation: want alternatives / other directions.",
    "- isSelection: pick a route/option/version (e.g. \"use the second one\", \"pehla wala\").",
    "- isExport / isDeliveryRequest / exportFormat: download or export in a format.",
    "- referencesExistingResult / hasDeicticReference: refers to prior output (this/that/route 2).",
    "- isSubstantiveNewGeneration: long/clear new brief for a deliverable (true even without English \"create\").",
    `- Active deliverable already exists in this thread: ${input.hasActiveDeliverable ? "yes" : "no"}.`,
    "- confidence: 0-1 how sure you are of the classification.",
    "- Empty string for exportFormat / mentionsArtifactType / quantityHint when unknown.",
    "",
    `Message:\n${message.slice(0, 4000)}`,
  ].join("\n");

  for (const provider of LLM_PROVIDERS) {
    const requestId = id("cti_semantic");
    try {
      const result = await input.integration.run({
        requestId,
        rawPrompt: llmPrompt,
        organizationId: asOrganizationId(input.organizationId),
        workspaceId: asWorkspaceId("ws_default"),
        correlationId: requestId,
        mode: "direct_provider" as never,
        metadata: applyDirectPassthroughMetadata({
          skipOutputRequirements: true,
          productAction: "cti_semantic_classify",
          preferredProviderId: provider.providerId,
          preferredModelId: provider.modelId,
          providerId: provider.providerId,
          modelId: provider.modelId,
          capabilityId: "text.generate",
          structuredOutput: {
            name: "cti_semantic_signals",
            schema: SIGNAL_SCHEMA,
            strict: true,
          },
        }),
      });

      if (!result.ok || result.value.success === false) continue;
      const parsed = extractStructured(result.value.artifacts.runtime);
      if (!parsed) continue;
      const mapped = mapLlmSignals(parsed);
      if (mapped) return mapped;
    } catch {
      continue;
    }
  }

  return heuristicFallback(message);
}
