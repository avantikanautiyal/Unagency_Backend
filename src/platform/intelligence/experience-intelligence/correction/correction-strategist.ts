/**
 * Correction strategist — generates structured correction records.
 */

import { success, type Result } from "../../shared/result";
import type { CorrectionStrategy } from "../contracts/correction";
import type { RootCause } from "../contracts/root-cause";
import type { Experience } from "../contracts/experience";
import type { ICorrectionStrategist } from "../interfaces/experience-intelligence";

const CORRECTION_MAP: Record<string, { kind: import("../contracts/enums").CorrectionKind; instruction: string }> = {
  weak_cta: { kind: "include_cta", instruction: "Always include a clear call-to-action" },
  brand_mismatch: { kind: "adjust_tone", instruction: "Use brand-aligned tone and vocabulary" },
  hallucination: { kind: "add_knowledge", instruction: "Increase knowledge context grounding" },
  wrong_reasoning_strategy: { kind: "increase_reasoning_depth", instruction: "Enable deeper reasoning strategy" },
  wrong_workflow: { kind: "switch_workflow", instruction: "Select alternative workflow pattern" },
  prompt_ambiguity: { kind: "clarify_prompt", instruction: "Reduce prompt ambiguity with explicit constraints" },
  missing_context: { kind: "add_knowledge", instruction: "Include missing contextual knowledge" },
  poor_model_choice: { kind: "switch_model", instruction: "Select model better suited for task" },
  budget_restriction: { kind: "custom", instruction: "Adjust execution scope to fit budget tier" },
  governance_block: { kind: "require_human_review", instruction: "Route through human review gate" },
};

export class DefaultCorrectionStrategist implements ICorrectionStrategist {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  generate(
    rootCauses: readonly RootCause[],
    experiences: readonly Experience[]
  ): Result<readonly CorrectionStrategy[]> {
    const strategies: CorrectionStrategy[] = [];

    for (const cause of rootCauses) {
      const mapped = CORRECTION_MAP[cause.kind];
      strategies.push(
        Object.freeze({
          strategyId: this.createId("corr"),
          kind: mapped?.kind ?? "custom",
          instruction: mapped?.instruction ?? cause.description,
          rationale: cause.description,
          priority: cause.confidence > 0.8 ? "high" : "medium",
          advisoryOnly: true as const,
        })
      );
    }

    for (const exp of experiences) {
      if (!strategies.some((s) => s.instruction === exp.correctionStrategy.instruction)) {
        strategies.push(exp.correctionStrategy);
      }
    }

    return success(strategies);
  }
}
