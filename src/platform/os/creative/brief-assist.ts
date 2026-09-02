/**
 * Track A Phase A4 — Soft Brief Assist (empty/vague + explicit opt-in only).
 * Never auto-compiles every brief. Never rewrites generate path silently.
 */

import {
  continuityLayerAffectsGeneration,
  getContinuityLayerFlag,
  type ContinuityLayerRollout,
} from "./continuity-layer-flags";
import { logOsExecutionEvent } from "../observability/execution-log";

const ROLLOUT_VALUES = new Set<ContinuityLayerRollout>([
  "off",
  "shadow",
  "canary",
  "on",
]);

/** Env `CONTINUITY_BRIEF_ASSIST=off|shadow|canary|on` overrides table default. */
export function resolveBriefAssistRollout(
  env: NodeJS.ProcessEnv = process.env
): ContinuityLayerRollout {
  const raw = env.CONTINUITY_BRIEF_ASSIST?.trim().toLowerCase();
  if (raw && ROLLOUT_VALUES.has(raw as ContinuityLayerRollout)) {
    return raw as ContinuityLayerRollout;
  }
  return getContinuityLayerFlag("BriefAssist")?.rollout ?? "off";
}

export interface BriefAssistQuestion {
  readonly id: string;
  readonly prompt: string;
}

export interface BriefAssistResult {
  readonly rollout: ContinuityLayerRollout;
  readonly isEmptyOrVague: boolean;
  readonly optedIn: boolean;
  readonly needsAssist: boolean;
  readonly questions: readonly BriefAssistQuestion[];
  /** Short structured scaffold — user must confirm; not auto-sent as prompt. */
  readonly suggestedScaffold?: string;
  readonly blockGenerate: boolean;
}

const VAGUE_ONLY_RE =
  /^(hi|hello|help|please|do\s+it|make\s+(something|it)|generate|create|design|logo|post|ad)\.?$/i;

export function isBriefEmptyOrVague(brief: string): boolean {
  const t = brief.trim();
  if (!t) return true;
  if (t.length < 12) return true;
  if (VAGUE_ONLY_RE.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return true;
  return false;
}

export function clientOptedInBriefAssist(
  metadata: Readonly<Record<string, unknown>> | undefined
): boolean {
  return (
    metadata?.optInBriefAssist === true ||
    metadata?.briefAssist === true ||
    metadata?.requestBriefAssist === true
  );
}

export function buildBriefAssistQuestions(input: {
  readonly service?: string;
  readonly brandId?: string;
}): readonly BriefAssistQuestion[] {
  const service = input.service?.trim() || "this deliverable";
  return [
    {
      id: "audience",
      prompt: `Who is the audience for ${service}?`,
    },
    {
      id: "outcome",
      prompt: "What should someone do or feel after seeing this?",
    },
    {
      id: "must_include",
      prompt: input.brandId
        ? "Any must-include brand elements (logo, colors, product)?"
        : "Any must-include facts, offers, or constraints?",
    },
  ];
}

export function runBriefAssist(input: {
  readonly brief: string;
  readonly organizationId: string;
  readonly executionId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly rollout?: ContinuityLayerRollout;
}): BriefAssistResult | null {
  const rollout = input.rollout ?? resolveBriefAssistRollout();
  if (rollout === "off") return null;

  const isEmptyOrVague = isBriefEmptyOrVague(input.brief);
  const optedIn = clientOptedInBriefAssist(input.metadata);
  const needsAssist = isEmptyOrVague && optedIn;
  const service =
    typeof input.metadata?.service === "string"
      ? input.metadata.service
      : undefined;
  const brandId =
    typeof input.metadata?.brandId === "string"
      ? input.metadata.brandId
      : undefined;

  const questions = needsAssist
    ? buildBriefAssistQuestions({ service, brandId })
    : [];

  const suggestedScaffold = needsAssist
    ? [
        `Service: ${service ?? "unspecified"}`,
        "Audience: …",
        "Outcome: …",
        "Must include: …",
        "Tone: …",
      ].join("\n")
    : undefined;

  const blockGenerate =
    needsAssist && continuityLayerAffectsGeneration(rollout);

  if (needsAssist) {
    logOsExecutionEvent("continuity.brief_assist", {
      requestId: input.executionId ?? "prepass",
      executionId: input.executionId ?? "prepass",
      organizationId: input.organizationId,
      status: blockGenerate ? "ask" : "shadow",
      capabilityId: service,
    });
  }

  return {
    rollout,
    isEmptyOrVague,
    optedIn,
    needsAssist,
    questions,
    suggestedScaffold,
    blockGenerate,
  };
}

export function briefAssistMetadataExtras(
  result: BriefAssistResult | null
): Record<string, unknown> | undefined {
  if (!result?.needsAssist) return undefined;
  if (result.rollout === "shadow") {
    return {
      briefAssistShadow: {
        questions: result.questions,
        suggestedScaffold: result.suggestedScaffold,
      },
    };
  }
  return {
    briefAssist: {
      questions: result.questions,
      suggestedScaffold: result.suggestedScaffold,
      awaitingAnswers: result.blockGenerate,
    },
  };
}
