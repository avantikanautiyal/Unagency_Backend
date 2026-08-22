/**
 * Phase 7 — Build RefinementSpecification from structured MCQ answers.
 */

import type { FeedbackAnswer } from "../contracts/feedback-session";
import type { RefinementRequest } from "../contracts/refinement-request";
import type {
  RefinementPriority,
  RefinementSpecification,
  RequestedChange,
} from "../contracts/refinement-specification";
import { resolveRefinementConflicts } from "../conflict/conflict-resolver";

function priorityForIndex(index: number): RefinementPriority {
  if (index === 0) return "highest";
  if (index === 1) return "high";
  if (index === 2) return "medium";
  return "low";
}

export function buildRefinementSpecification(input: {
  readonly request: RefinementRequest;
  readonly answers: readonly FeedbackAnswer[];
  readonly createId?: (prefix: string) => string;
  readonly nowIso?: () => string;
}): RefinementSpecification {
  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const createId = input.createId ?? ((p) => `${p}_${Date.now()}`);
  const req = input.request;

  const changes: RequestedChange[] = [];
  const preserve = new Set<string>();
  const dissatisfaction: string[] = [];
  const direction: string[] = [];

  let changeIndex = 0;
  for (const answer of input.answers) {
    if (answer.dimension === "dissatisfaction") {
      for (const v of answer.values) dissatisfaction.push(v);
    }
    if (answer.dimension === "preserve") {
      for (const sig of answer.refinementSignals) {
        if (sig !== "preserve.none") {
          preserve.add(sig.replace(/^preserve\./, ""));
        }
      }
      continue;
    }
    for (let i = 0; i < answer.refinementSignals.length; i++) {
      const signal = answer.refinementSignals[i]!;
      const value = answer.values[i] ?? answer.values[0] ?? signal;
      if (signal.startsWith("preserve.")) {
        preserve.add(signal.replace(/^preserve\./, ""));
        continue;
      }
      if (value === "keep" || signal.endsWith(".keep")) {
        preserve.add(answer.dimension);
        continue;
      }
      changes.push({
        dimension: answer.dimension,
        signal,
        value,
        priority: priorityForIndex(changeIndex++),
      });
      direction.push(signal);
    }
    if (answer.otherText?.trim()) {
      changes.push({
        dimension: answer.dimension,
        signal: `${answer.dimension}.other_text`,
        value: answer.otherText.trim().slice(0, 280),
        priority: priorityForIndex(changeIndex++),
      });
    }
  }

  const resolved = resolveRefinementConflicts(changes, {
    outputContractId: req.outputContractId,
    brandTone: req.brandTone,
    brandAvoidTerms: req.brandAvoidTerms,
    prohibitedPatterns: req.prohibitedPatterns,
    mandatoryPreserve: req.outputType === "landing_page" ? ["cta"] : [],
  });

  for (const p of resolved.forcedPreserve) preserve.add(p);

  const priorities = resolved.accepted.map((c) => ({
    dimension: c.dimension,
    priority: c.priority,
  }));

  const constraints = [
    ...resolved.conflicts.map((c) => `${c.winningConstraint}:${c.code}`),
    ...(req.brandAvoidTerms ?? []).map((t) => `brand.avoid:${t}`),
  ];

  const brandConstraints = [
    ...(req.brandTone ? [`tone:${req.brandTone}`] : []),
    ...(req.brandAvoidTerms ?? []).map((t) => `avoid:${t}`),
    ...(req.prohibitedPatterns ?? []).map((p) => `prohibited:${p}`),
  ];

  const replanReason = [
    `refinement_v${req.refinementVersion}`,
    `from_output=${req.sourceOutputId}@v${req.sourceVersion}`,
    `changes=${resolved.accepted.map((c) => c.signal).join(",") || "none"}`,
    `preserve=${[...preserve].join(",") || "none"}`,
  ].join("; ");

  return {
    specificationId: createId("rspec"),
    refinementId: req.refinementId,
    organizationId: req.organizationId,
    executionId: req.executionId,
    sourceOutputId: req.sourceOutputId,
    sourceVersion: req.sourceVersion,
    refinementVersion: req.refinementVersion,
    outputType: req.outputType,
    ...(req.brandId ? { brandId: req.brandId } : {}),
    dissatisfactionAreas: dissatisfaction,
    requestedChanges: resolved.accepted,
    desiredDirection: direction,
    preserveRequirements: [...preserve],
    constraints,
    priorities,
    feedbackAnswers: input.answers,
    brandConstraints,
    conflicts: resolved.conflicts,
    replanReason,
    createdAt: nowIso(),
    version: "1.0.0",
  };
}
