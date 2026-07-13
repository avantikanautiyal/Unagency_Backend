/**
 * Sequential judge pipeline — runs registered judges for a rubric.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import { EvaluationError } from "../errors";
import type { JudgeResult } from "../contracts/evaluation-models";
import type { IJudge, IJudgePipeline, JudgeContext } from "../interfaces/evaluation-ports";

export class JudgePipeline implements IJudgePipeline {
  constructor(private readonly judges: readonly IJudge[]) {}

  async evaluate(context: JudgeContext): Promise<Result<readonly JudgeResult[]>> {
    const results: JudgeResult[] = [];
    const kindsInRubric = new Set(context.rubric.criteria.map((c) => c.kind));

    for (const judge of this.judges) {
      if (!kindsInRubric.has(judge.kind)) {
        continue;
      }

      const result = await judge.evaluate(context);
      if (!result.ok) {
        return failure(
          new EvaluationError(`Judge ${judge.judgeId} failed`, {
            kind: judge.kind,
            cause: result.error.message,
          })
        );
      }
      results.push(result.value);
    }

    return success(results);
  }
}

import { BrandJudge } from "./brand-judge";
import { FactualJudge } from "./factual-judge";
import { GrammarJudge } from "./grammar-judge";
import { HallucinationJudge } from "./hallucination-judge";
import { HumanJudge } from "./human-judge";
import { InstructionJudge } from "./instruction-judge";
import { PolicyJudge } from "./policy-judge";
import { SafetyJudge } from "./safety-judge";
import { SchemaJudge } from "./schema-judge";

export function createDefaultJudgePipeline(): JudgePipeline {
  return new JudgePipeline([
    new InstructionJudge(),
    new BrandJudge(),
    new PolicyJudge(),
    new SchemaJudge(),
    new GrammarJudge(),
    new SafetyJudge(),
    new FactualJudge(),
    new HallucinationJudge(),
    new HumanJudge(),
  ]);
}
