/**
 * CDF brief gate (server) — classifies a typed message while a session awaits
 * its brief. Never mutates CDF sessions; the client only skips submit_brief
 * when this returns decision=hold (enforce mode).
 *
 * CDF_BRIEF_GATE_MODE: off | shadow (default, log only) | enforce.
 */

import type { IDirectExecutionEngine } from "../direct/contracts";
import { asOrganizationId, asWorkspaceId } from "../core/identifiers";
import { normalizeSchemaForOpenAiStrict } from "../providers/tools/structured/structured-output-execution";
import { applyDirectPassthroughMetadata } from "../api/services/execution-thin-path";
import {
  CDF_BRIEF_TURN_TYPES,
  classifyCdfBriefTurnLocal,
  decideCdfBriefGate,
  type CdfBriefGateMode,
  type CdfBriefGateRequest,
  type CdfBriefGateResponse,
  type CdfBriefTurnType,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf-brief-gate";

export function resolveCdfBriefGateMode(
  env: Readonly<Record<string, string | undefined>> = process.env,
): CdfBriefGateMode {
  const raw = (env.CDF_BRIEF_GATE_MODE ?? "").trim().toLowerCase();
  if (raw === "off" || raw === "enforce") return raw;
  return "shadow";
}

const TURN_SCHEMA = normalizeSchemaForOpenAiStrict({
  type: "object",
  properties: {
    turnType: { type: "string", enum: [...CDF_BRIEF_TURN_TYPES] },
    confidence: { type: "number" },
  },
  required: ["turnType", "confidence"],
  additionalProperties: false,
});

const LLM_PROVIDERS = [
  { providerId: "provider.openai", modelId: "gpt-4o-mini" },
  { providerId: "provider.gemini", modelId: "gemini-2.5-flash" },
] as const;

function parseStructured(output: Record<string, unknown> | undefined): {
  turnType: CdfBriefTurnType;
  confidence: number;
} | null {
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
  const turnType = String(parsed.turnType ?? "").trim() as CdfBriefTurnType;
  if (!CDF_BRIEF_TURN_TYPES.includes(turnType)) return null;
  const raw = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
  return { turnType, confidence: Math.max(0, Math.min(1, raw)) };
}

async function classifyWithModel(input: {
  readonly integration: IDirectExecutionEngine;
  readonly organizationId: string;
  readonly request: CdfBriefGateRequest;
  readonly createId: (prefix: string) => string;
}): Promise<{ turnType: CdfBriefTurnType; confidence: number } | null> {
  const r = input.request;
  const context = [
    r.service || r.serviceId ? `service "${r.service ?? r.serviceId}"` : "",
    r.platform ? `platform "${r.platform}"` : "",
    r.subtype ? `subtype "${r.subtype}"` : "",
    r.category ? `category "${r.category}"` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const prompt = [
    "A creative-production assistant is waiting for the user's brief.",
    "Classify the user's latest message. It may be in any language, mixed languages, or broken English.",
    context ? `The user already selected: ${context}.` : "",
    "",
    "turnType:",
    '- "brief": says anything about WHAT to create — a topic, occasion, product, offer, deliverable, style or audience. Even one word counts (e.g. "Diwali", "logo", "summer sale").',
    '- "partial_brief": wants something created but gives no specifics (e.g. "make one", "kuch accha bana do").',
    '- "small_talk": greetings, pleasantries, reactions, or talking to/about the assistant with no creative content (e.g. "hi", "who are you", "thanks").',
    '- "question": asks what the assistant can do or how it works, without requesting a creative.',
    '- "unclear": gibberish, keyboard noise, or impossible to interpret.',
    "When in doubt, choose \"brief\". confidence is 0..1.",
    "",
    `Message:\n${r.text.slice(0, 500)}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  for (const provider of LLM_PROVIDERS) {
    const requestId = input.createId("cdf_brief_gate");
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
          productAction: "cdf_brief_gate_classify",
          preferredProviderId: provider.providerId,
          preferredModelId: provider.modelId,
          providerId: provider.providerId,
          modelId: provider.modelId,
          capabilityId: "text.generate",
          structuredOutput: {
            name: "cdf_brief_gate",
            schema: TURN_SCHEMA,
            strict: true,
          },
        }),
      });
      if (!result.ok || result.value.success === false) continue;
      const output = result.value.artifacts.runtime?.response?.output as
        | Record<string, unknown>
        | undefined;
      const parsed = parseStructured(output);
      if (parsed) return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

export async function evaluateCdfBriefGate(input: {
  readonly request: CdfBriefGateRequest;
  readonly organizationId: string;
  readonly integration?: IDirectExecutionEngine;
  readonly mode?: CdfBriefGateMode;
  readonly createId?: (prefix: string) => string;
}): Promise<CdfBriefGateResponse> {
  const mode = input.mode ?? resolveCdfBriefGateMode();
  const text = String(input.request.text ?? "").trim();

  let turnType: CdfBriefTurnType = "brief";
  let confidence = 1;
  let source: CdfBriefGateResponse["source"] = "disabled";

  if (mode !== "off") {
    const local = classifyCdfBriefTurnLocal(text);
    if (local.kind === "brief") {
      source = "local";
    } else if (local.kind === "conversation") {
      source = "local";
      turnType = local.reason === "filler_only" ? "small_talk" : "unclear";
      confidence = 0.95;
    } else if (input.integration && input.organizationId.trim()) {
      const model = await classifyWithModel({
        integration: input.integration,
        organizationId: input.organizationId,
        request: { ...input.request, text },
        createId: input.createId ?? ((p) => `${p}_${Date.now()}`),
      });
      if (model) {
        source = "llm";
        turnType = model.turnType;
        confidence = model.confidence;
      } else {
        source = "llm_unavailable";
      }
    } else {
      source = "llm_unavailable";
    }
  }

  const { decision, wouldHold } = decideCdfBriefGate({
    mode,
    turnType,
    confidence,
  });

  console.info(
    JSON.stringify({
      scope: "cdf.brief_gate",
      event: "turn_classified",
      mode,
      decision,
      wouldHold,
      turnType,
      confidence,
      source,
      organizationId: input.organizationId,
      serviceId: input.request.serviceId ?? null,
      textLength: text.length,
      textPreview: text.slice(0, 60),
      ts: new Date().toISOString(),
    }),
  );

  return { mode, decision, turnType, confidence, wouldHold, source };
}
