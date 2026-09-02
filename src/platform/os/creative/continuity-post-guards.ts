/**
 * Track A Phase A3 — post-generation continuity guards.
 * Hard misses may retry ≤1. Taste findings never auto-retry (suggest refine).
 */

import { BrandGuardEvaluator } from "../evaluation/evaluators/brand-guard";
import { SpecGuardEvaluator } from "../evaluation/evaluators/spec-guard";
import type {
  EvaluationFinding,
  EvaluationResult,
} from "../evaluation/contracts/evaluation-result";
import {
  extractContinuityGuardContext,
  type ContinuityGuardContext,
} from "./continuity-guard-context";
import { MAX_HARD_GUARD_RETRIES } from "./continuity-budgets";
import {
  getContinuityLayerFlag,
  type ContinuityLayerRollout,
} from "./continuity-layer-flags";
import { logOsExecutionEvent } from "../observability/execution-log";
import { resolveOutputContractId } from "../../api/services/execution-governance-extras";

const ROLLOUT_VALUES = new Set<ContinuityLayerRollout>([
  "off",
  "shadow",
  "canary",
  "on",
]);

/** Finding codes that may trigger a single hard retry. */
export const CONTINUITY_HARD_MISS_CODES = new Set([
  "SPEC_EMPTY_OUTPUT",
  "SPEC_MISSING_CONTRACT",
  "BRAND_AVOID_TERM",
  "BRAND_PROHIBITED_PATTERN",
  "BRAND_INJECTION_PATTERN",
  "BRAND_BOUND_OUTPUT_MISSING",
]);

/** Taste / soft codes — never auto-retry. */
export const CONTINUITY_TASTE_CODES = new Set([
  "BRAND_TONE_MISMATCH",
  "BRAND_TASTE_SUGGEST_REFINE",
  "BRAND_CONTINUITY_VISUAL_UNVERIFIED",
  "SPEC_MISSING_SECTION",
  "SPEC_MISSING_CTA",
  "BRAND_CONTEXT_MISSING",
]);

export function resolvePostGuardsRollout(
  env: NodeJS.ProcessEnv = process.env
): ContinuityLayerRollout {
  const raw = env.CONTINUITY_POST_GUARDS?.trim().toLowerCase();
  if (raw && ROLLOUT_VALUES.has(raw as ContinuityLayerRollout)) {
    return raw as ContinuityLayerRollout;
  }
  return getContinuityLayerFlag("PostGuardsHardRetry")?.rollout ?? "off";
}

export function classifyContinuityFindings(
  findings: readonly EvaluationFinding[]
): {
  readonly hardMisses: readonly EvaluationFinding[];
  readonly tasteWarnings: readonly EvaluationFinding[];
  readonly other: readonly EvaluationFinding[];
} {
  const hardMisses: EvaluationFinding[] = [];
  const tasteWarnings: EvaluationFinding[] = [];
  const other: EvaluationFinding[] = [];
  for (const f of findings) {
    if (CONTINUITY_HARD_MISS_CODES.has(f.code)) hardMisses.push(f);
    else if (
      CONTINUITY_TASTE_CODES.has(f.code) ||
      f.severity === "warning" ||
      f.severity === "info"
    ) {
      tasteWarnings.push(f);
    } else if (f.severity === "error" || f.severity === "critical") {
      hardMisses.push(f);
    } else {
      other.push(f);
    }
  }
  return { hardMisses, tasteWarnings, other };
}

export function shouldHardRetry(input: {
  readonly hardMisses: readonly EvaluationFinding[];
  readonly retryCount: number;
  readonly maxRetries?: number;
}): boolean {
  const max = input.maxRetries ?? MAX_HARD_GUARD_RETRIES;
  return input.hardMisses.length > 0 && input.retryCount < max;
}

export interface ContinuityPostGuardReport {
  readonly rollout: ContinuityLayerRollout;
  readonly context: ContinuityGuardContext;
  readonly results: readonly EvaluationResult[];
  readonly findings: readonly EvaluationFinding[];
  readonly hardMisses: readonly EvaluationFinding[];
  readonly tasteWarnings: readonly EvaluationFinding[];
  readonly suggestRefine: boolean;
  readonly hardRetryRecommended: boolean;
  readonly retryCount: number;
}

export function runContinuityPostGuards(input: {
  readonly organizationId: string;
  readonly executionId: string;
  readonly capabilityId: string;
  readonly preview: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly mediaArtifactIds?: readonly string[];
  readonly retryCount?: number;
  readonly rollout?: ContinuityLayerRollout;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}): ContinuityPostGuardReport | null {
  const rollout = input.rollout ?? resolvePostGuardsRollout();
  if (rollout === "off") return null;

  const context = extractContinuityGuardContext(input.metadata);
  const retryCount = input.retryCount ?? 0;
  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);

  const brandGuard = new BrandGuardEvaluator();
  const specGuard = new SpecGuardEvaluator();

  const isImage =
    /image\.generate|output\.image/i.test(input.capabilityId) ||
    input.capabilityId.toLowerCase().includes("image");

  const evalInput = {
    organizationId: input.organizationId,
    executionId: input.executionId,
    planId: `plan_${input.executionId}`,
    planVersion: 1,
    outputContractId: resolveOutputContractId(input.capabilityId, {
      outputKind:
        typeof input.metadata?.outputKind === "string"
          ? input.metadata.outputKind
          : undefined,
      structuredOutputName:
        input.metadata?.structuredOutput &&
        typeof input.metadata.structuredOutput === "object"
          ? String(
              (input.metadata.structuredOutput as { name?: unknown }).name ??
                ""
            )
          : undefined,
    }),
    preview: input.preview,
    brandTone: context.brandTone,
    brandVoice: context.brandVoice,
    brandAvoidTerms: context.brandAvoidTerms,
    continuityBound: context.continuityBound,
    boundLogoAssetId: context.boundLogoAssetId,
    mediaOutputCount: input.mediaArtifactIds?.length ?? 0,
    capabilityId: input.capabilityId,
    isImageCapability: isImage,
    service:
      typeof input.metadata?.service === "string"
        ? input.metadata.service
        : undefined,
    outputKind:
      typeof input.metadata?.outputKind === "string"
        ? input.metadata.outputKind
        : undefined,
    mockupRole:
      typeof input.metadata?.mockupRole === "string"
        ? input.metadata.mockupRole
        : undefined,
    expectedModalities: Array.isArray(input.metadata?.outputModalities)
      ? input.metadata.outputModalities.filter(
          (m): m is string => typeof m === "string"
        )
      : undefined,
    expectedAspectRatio:
      typeof input.metadata?.aspectRatio === "string"
        ? input.metadata.aspectRatio
        : undefined,
    nowIso,
    createId,
  };

  const results = [specGuard.evaluate(evalInput), brandGuard.evaluate(evalInput)];
  const findings = results.flatMap((r) => r.findings);
  const { hardMisses, tasteWarnings } = classifyContinuityFindings(findings);
  const hardRetryRecommended =
    (rollout === "on" || rollout === "canary") &&
    shouldHardRetry({ hardMisses, retryCount });

  logOsExecutionEvent("continuity.post_guards", {
    requestId: input.executionId,
    executionId: input.executionId,
    organizationId: input.organizationId,
    status: hardMisses.length
      ? hardRetryRecommended
        ? "hard_retry"
        : "hard_miss"
      : tasteWarnings.length
        ? "taste_warn"
        : "pass",
    capabilityId: input.capabilityId,
  });

  return {
    rollout,
    context,
    results,
    findings,
    hardMisses,
    tasteWarnings,
    suggestRefine: tasteWarnings.length > 0 && hardMisses.length === 0,
    hardRetryRecommended,
    retryCount,
  };
}

export function continuityPostGuardExtras(
  report: ContinuityPostGuardReport | null
): Record<string, unknown> | undefined {
  if (!report) return undefined;
  return {
    continuityPostGuards: {
      rollout: report.rollout,
      hardMissCodes: report.hardMisses.map((f) => f.code),
      tasteCodes: report.tasteWarnings.map((f) => f.code),
      suggestRefine: report.suggestRefine,
      hardRetryRecommended: report.hardRetryRecommended,
      retryCount: report.retryCount,
      provenance: report.context.provenanceLine,
      findings: report.findings.map((f) => ({
        code: f.code,
        message: f.message,
        severity: f.severity,
      })),
    },
  };
}
