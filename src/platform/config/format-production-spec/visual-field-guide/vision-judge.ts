/**
 * Phase 6 C2 — Vision Field Guide judge scaffold.
 *
 * Produces structured Gate judgments for MODEL_JUDGED hygiene ids.
 * Default implementation is a pure rubric builder + optional async hook;
 * callers register a vision model via `setVisualFieldGuideJudgeRunner`.
 * Uncertain results must become REVIEW (not silent PASS).
 */

import type { ProductionHygieneCheck } from "../types";
import { resolveVisualFieldGuide } from "./resolve-visual-field-guide";
import { getServiceVisualRecipe } from "./service-visual-recipes";

export type VisualFieldGuideJudgeVerdict = "pass" | "fail" | "uncertain";

export type VisualFieldGuideJudgeCheckResult = {
  readonly checkId: string;
  readonly verdict: VisualFieldGuideJudgeVerdict;
  readonly rationale: string;
  readonly confidence: number;
};

export type VisualFieldGuideJudgeResult = {
  readonly status: "ok" | "skipped" | "error";
  readonly checks: readonly VisualFieldGuideJudgeCheckResult[];
  readonly failedGateHygieneIds: readonly string[];
  readonly evidencedGateHygieneIds: readonly string[];
  /** Uncertain / skipped model-judged gates → REVIEW evidence gap. */
  readonly unresolvedGateHygieneIds: readonly string[];
  readonly evidence: readonly string[];
};

export type VisualFieldGuideJudgeInput = {
  readonly service?: string | null;
  /** Optional image bytes / URL for a registered runner. */
  readonly imageBytes?: Buffer;
  readonly imageUrl?: string;
  readonly mimeType?: string;
  /** Limit which check ids to judge (default: recipe MODEL_JUDGED gates). */
  readonly checkIds?: readonly string[];
  readonly briefSummary?: string;
};

export type VisualFieldGuideJudgeRunner = (
  input: VisualFieldGuideJudgeInput & {
    readonly rubricLines: readonly string[];
    readonly checks: readonly ProductionHygieneCheck[];
  },
) => Promise<readonly VisualFieldGuideJudgeCheckResult[]>;

let runner: VisualFieldGuideJudgeRunner | undefined;

/** Register an async vision auditor (separate from the generator). */
export function setVisualFieldGuideJudgeRunner(
  next: VisualFieldGuideJudgeRunner | undefined,
): void {
  runner = next;
}

export function getVisualFieldGuideJudgeRunner():
  | VisualFieldGuideJudgeRunner
  | undefined {
  return runner;
}

/**
 * Build the auditor system rubric from the Field Guide pack for a service.
 */
export function buildVisualFieldGuideJudgeRubric(input: {
  readonly service?: string | null;
}): {
  readonly rubricLines: readonly string[];
  readonly checks: readonly ProductionHygieneCheck[];
} {
  const guide = resolveVisualFieldGuide({ service: input.service });
  const recipe = getServiceVisualRecipe(input.service);
  const checks: ProductionHygieneCheck[] = [];
  if (recipe) {
    for (const c of [...recipe.checkFirst, ...recipe.checkLast]) {
      if (c.weight !== "gate") continue;
      // Vision can audit MODEL_JUDGED and HEURISTIC gates; NOT_AUTOMATED stays human.
      if (
        c.evaluationMethod === "MODEL_JUDGED" ||
        c.evaluationMethod === "HEURISTIC"
      ) {
        checks.push(c);
      }
    }
  }

  const rubricLines = Object.freeze([
    "You are an UNAGENCY Visual Field Guide auditor — not a creative generator.",
    "Judge only the listed Gate checks. Prefer fail or uncertain over false pass.",
    ...guide.identity.lines,
    ...guide.layout.lines,
    ...guide.goodPractice.map((g) => g.promptLine),
    ...(recipe
      ? [
          `Service ${recipe.serviceNumber} ${recipe.title}: ${recipe.mantra}`,
          recipe.compositionPrompt,
        ]
      : []),
    ...checks.map(
      (c) => `Check [${c.id}]: PASS if — ${c.passDefinition}`,
    ),
  ]);

  return Object.freeze({
    rubricLines,
    checks: Object.freeze(checks),
  });
}

function summarizeResults(
  results: readonly VisualFieldGuideJudgeCheckResult[],
): Pick<
  VisualFieldGuideJudgeResult,
  | "failedGateHygieneIds"
  | "evidencedGateHygieneIds"
  | "unresolvedGateHygieneIds"
> {
  const failed: string[] = [];
  const evidenced: string[] = [];
  const unresolved: string[] = [];
  for (const r of results) {
    if (r.verdict === "pass") evidenced.push(r.checkId);
    else if (r.verdict === "fail") failed.push(r.checkId);
    else unresolved.push(r.checkId);
  }
  return {
    failedGateHygieneIds: Object.freeze([...failed]),
    evidencedGateHygieneIds: Object.freeze([...evidenced]),
    unresolvedGateHygieneIds: Object.freeze([...unresolved]),
  };
}

/**
 * Run the Field Guide vision judge when a runner is registered.
 * Without a runner: returns skipped + all MODEL_JUDGED checks unresolved (REVIEW).
 */
export async function runVisualFieldGuideJudge(
  input: VisualFieldGuideJudgeInput,
): Promise<VisualFieldGuideJudgeResult> {
  const { rubricLines, checks: allChecks } = buildVisualFieldGuideJudgeRubric({
    service: input.service,
  });
  const wanted = input.checkIds?.length
    ? allChecks.filter((c) => input.checkIds!.includes(c.id))
    : allChecks;

  if (wanted.length === 0) {
    return Object.freeze({
      status: "skipped" as const,
      checks: Object.freeze([]),
      failedGateHygieneIds: Object.freeze([]),
      evidencedGateHygieneIds: Object.freeze([]),
      unresolvedGateHygieneIds: Object.freeze([]),
      evidence: Object.freeze(["No MODEL_JUDGED Field Guide checks for service"]),
    });
  }

  if (!runner) {
    return Object.freeze({
      status: "skipped" as const,
      checks: Object.freeze([]),
      failedGateHygieneIds: Object.freeze([]),
      evidencedGateHygieneIds: Object.freeze([]),
      unresolvedGateHygieneIds: Object.freeze(wanted.map((c) => c.id)),
      evidence: Object.freeze([
        "Visual Field Guide vision judge runner not registered — MODEL_JUDGED checks unresolved (REVIEW)",
      ]),
    });
  }

  try {
    const results = await runner({
      ...input,
      rubricLines,
      checks: wanted,
    });
    const summary = summarizeResults(results);
    return Object.freeze({
      status: "ok" as const,
      checks: Object.freeze([...results]),
      ...summary,
      evidence: Object.freeze(
        results.map((r) => `${r.checkId}:${r.verdict} — ${r.rationale}`),
      ),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Object.freeze({
      status: "error" as const,
      checks: Object.freeze([]),
      failedGateHygieneIds: Object.freeze([]),
      evidencedGateHygieneIds: Object.freeze([]),
      unresolvedGateHygieneIds: Object.freeze(wanted.map((c) => c.id)),
      evidence: Object.freeze([`Vision judge error: ${msg}`]),
    });
  }
}
