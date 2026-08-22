/**
 * SpecGuard — deterministic specification / output-contract compliance.
 */

import type { IOutputContractRegistry } from "../../contracts/layer-ports";
import { defaultOutputContractRegistry } from "../../contracts/output-contract-registry";
import type {
  EvaluateOutputInput,
  EvaluationFinding,
  EvaluationResult,
  IEvaluator,
} from "../contracts/evaluation-result";
import { OS_EVALUATION_VERSION } from "../contracts/evaluation-result";

export const SPEC_GUARD_EVALUATOR_ID = "spec_guard" as const;
export const SPEC_GUARD_VERSION = "1.0.0" as const;

export class SpecGuardEvaluator implements IEvaluator {
  readonly evaluatorId = SPEC_GUARD_EVALUATOR_ID;
  readonly category = "specification" as const;
  readonly evaluatorVersion = SPEC_GUARD_VERSION;

  constructor(
    private readonly contracts: IOutputContractRegistry = defaultOutputContractRegistry
  ) {}

  evaluate(input: EvaluateOutputInput): EvaluationResult {
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
    const findings: EvaluationFinding[] = [];
    let specScore = 1;

    const contract = this.contracts.getContract(input.outputContractId);
    if (!contract || contract.status === "not_implemented") {
      findings.push({
        code: "SPEC_MISSING_CONTRACT",
        message: `Output contract missing or not implemented: ${input.outputContractId}`,
        severity: "error",
      });
      specScore = 0;
    }

    const preview = (input.preview ?? "").trim();
    if (!preview) {
      findings.push({
        code: "SPEC_EMPTY_OUTPUT",
        message: "Output preview is empty",
        severity: "error",
        field: "preview",
      });
      specScore = Math.min(specScore, 0);
    }

    const sections = input.requiredSections ?? [];
    for (const section of sections) {
      const re = new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      if (preview && !re.test(preview)) {
        // Section presence is advisory — hard empty/contract failures are above.
        findings.push({
          code: "SPEC_MISSING_SECTION",
          message: `Required section/signal not found: ${section}`,
          severity: "warning",
          field: section,
        });
        specScore = Math.min(specScore, 0.85);
      }
    }

    // Landing page CTA heuristic when sections include CTA
    if (
      sections.some((s) => /cta/i.test(s)) &&
      preview &&
      !/\b(cta|call to action|shop now|buy now|learn more|get started|sign up)\b/i.test(
        preview
      )
    ) {
      findings.push({
        code: "SPEC_MISSING_CTA",
        message: "CTA signal not detected in landing page output",
        severity: "warning",
        field: "CTA",
      });
      specScore = Math.min(specScore, 0.8);
    }

    const errors = findings.filter((f) => f.severity === "error" || f.severity === "critical");
    const warnings = findings.filter((f) => f.severity === "warning");
    const outcome =
      errors.length > 0
        ? ("RETRY_REQUIRED" as const)
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
      scores: { specComplianceScore: specScore, overallScore: specScore },
      findings,
      severity: errors.length
        ? "error"
        : warnings.length
          ? "warning"
          : "info",
      confidence: 0.9,
      provenance: [
        {
          field: "outputContractId",
          value: input.outputContractId,
          source: "SYSTEM_RULE",
        },
      ],
    };
  }
}
