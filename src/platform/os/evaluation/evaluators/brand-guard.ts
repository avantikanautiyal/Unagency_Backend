/**
 * BrandGuard — post-generation brand compliance (DATA only; not instructions).
 */

import type {
  EvaluateOutputInput,
  EvaluationFinding,
  EvaluationResult,
  IEvaluator,
} from "../contracts/evaluation-result";
import { OS_EVALUATION_VERSION } from "../contracts/evaluation-result";

export const BRAND_GUARD_EVALUATOR_ID = "brand_guard" as const;
export const BRAND_GUARD_VERSION = "1.0.0" as const;

/** Injection / instruction-like patterns in output that violate brand data boundary. */
const INJECTION_RE =
  /\b(ignore\s+(all\s+)?previous\s+instructions?|reveal\s+secrets?|system\s+prompt)\b/i;

export class BrandGuardEvaluator implements IEvaluator {
  readonly evaluatorId = BRAND_GUARD_EVALUATOR_ID;
  readonly category = "brand" as const;
  readonly evaluatorVersion = BRAND_GUARD_VERSION;

  evaluate(input: EvaluateOutputInput): EvaluationResult {
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
    const findings: EvaluationFinding[] = [];
    let brandScore = 1;
    const preview = (input.preview ?? "").toLowerCase();

    const hasBrandSignal =
      Boolean(input.brandTone) ||
      Boolean(input.brandVoice) ||
      (input.brandAvoidTerms?.length ?? 0) > 0 ||
      (input.prohibitedPatterns?.length ?? 0) > 0;

    if (!hasBrandSignal) {
      findings.push({
        code: "BRAND_CONTEXT_MISSING",
        message: "No brand context provided — brand compliance skipped (not a hard fail)",
        severity: "info",
      });
      return {
        evaluationId: createId("eval"),
        version: OS_EVALUATION_VERSION,
        organizationId: input.organizationId,
        executionId: input.executionId,
        planId: input.planId,
        planVersion: input.planVersion,
        taskId: input.taskId,
        outputRefId: input.outputRefId,
        evaluatorId: this.evaluatorId,
        evaluatorType: this.category,
        evaluatorVersion: this.evaluatorVersion,
        evaluatedAt: nowIso(),
        outcome: "PASS_WITH_WARNINGS",
        scores: { brandComplianceScore: undefined, overallScore: undefined },
        findings,
        severity: "info",
        confidence: 0.5,
        provenance: [
          { field: "brandContext", value: "missing", source: "BRAND" },
        ],
      };
    }

    if (INJECTION_RE.test(input.preview ?? "")) {
      findings.push({
        code: "BRAND_INJECTION_PATTERN",
        message: "Output contains instruction-injection patterns",
        severity: "critical",
      });
      brandScore = 0;
    }

    for (const term of input.brandAvoidTerms ?? []) {
      const t = term.trim().toLowerCase();
      if (t.length >= 2 && preview.includes(t)) {
        findings.push({
          code: "BRAND_AVOID_TERM",
          message: `Disallowed brand terminology present: ${term}`,
          severity: "error",
          field: "vocabulary.avoid",
        });
        brandScore = Math.min(brandScore, 0.2);
      }
    }

    for (const pattern of input.prohibitedPatterns ?? []) {
      const p = pattern.trim();
      if (!p) continue;
      try {
        if (new RegExp(p, "i").test(input.preview ?? "")) {
          findings.push({
            code: "BRAND_PROHIBITED_PATTERN",
            message: `Prohibited brand pattern matched: ${p}`,
            severity: "critical",
          });
          brandScore = 0;
        }
      } catch {
        if (preview.includes(p.toLowerCase())) {
          findings.push({
            code: "BRAND_PROHIBITED_PATTERN",
            message: `Prohibited brand phrase present: ${p}`,
            severity: "critical",
          });
          brandScore = 0;
        }
      }
    }

    // Soft tone alignment: if tone says premium and output is slang-heavy, warn
    if (
      input.brandTone &&
      /premium|confident|luxury/i.test(input.brandTone) &&
      /\b(lol|omg|cheap|garbage|sucks)\b/i.test(input.preview ?? "")
    ) {
      findings.push({
        code: "BRAND_TONE_MISMATCH",
        message: "Output tone appears misaligned with premium/confident brand tone",
        severity: "warning",
        field: "tone",
      });
      brandScore = Math.min(brandScore, 0.7);
    }

    const critical = findings.some((f) => f.severity === "critical");
    const errors = findings.filter((f) => f.severity === "error" || f.severity === "critical");
    const warnings = findings.filter((f) => f.severity === "warning");

    const outcome = critical
      ? ("BLOCKED" as const)
      : errors.length > 0
        ? ("REJECTED" as const)
        : warnings.length > 0
          ? ("PASS_WITH_WARNINGS" as const)
          : ("PASS" as const);

    return {
      evaluationId: createId("eval"),
      version: OS_EVALUATION_VERSION,
      organizationId: input.organizationId,
      executionId: input.executionId,
      planId: input.planId,
      planVersion: input.planVersion,
      taskId: input.taskId,
      outputRefId: input.outputRefId,
      evaluatorId: this.evaluatorId,
      evaluatorType: this.category,
      evaluatorVersion: this.evaluatorVersion,
      evaluatedAt: nowIso(),
      outcome,
      scores: { brandComplianceScore: brandScore, overallScore: brandScore },
      findings,
      severity: critical
        ? "critical"
        : errors.length
          ? "error"
          : warnings.length
            ? "warning"
            : "info",
      confidence: 0.85,
      provenance: [
        {
          field: "brandTone",
          value: input.brandTone ?? "",
          source: "BRAND",
        },
      ],
    };
  }
}
