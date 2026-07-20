/**
 * Base certification suite runner.
 */

import { success, type Result } from "../../shared/result";
import { asSuiteRunId } from "../contracts/identifiers";
import type { CertificationArea } from "../contracts/enums";
import type { CertificationIssue, SuiteResult } from "../contracts/suite-result";
import type { CertificationHarness } from "../fixtures/harness";
import type { ICertificationSuite } from "../interfaces/certification";

export type AreaValidator = (harness: CertificationHarness) => CertificationIssue[];

export abstract class BaseCertificationSuite implements ICertificationSuite {
  readonly name: string;
  readonly areas: readonly CertificationArea[];

  constructor(
    name: string,
    areas: readonly CertificationArea[],
    private readonly validators: Readonly<Record<string, AreaValidator>>,
    private readonly createId: (prefix: string) => string = (p) => `${p}_1`,
    private readonly clockMs: () => number = () => Date.now()
  ) {
    this.name = name;
    this.areas = areas;
  }

  run(harness: CertificationHarness): Result<SuiteResult> {
    const start = this.clockMs();
    const issues: CertificationIssue[] = [];

    for (const area of this.areas) {
      const validator = this.validators[area];
      if (validator) {
        issues.push(...validator(harness));
      }
    }

    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");
    const maxScore = this.areas.length * 10;
    const score = Math.max(0, maxScore - errors.length * 10 - warnings.length * 3);

    const outcome =
      errors.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass";

    return success({
      suiteRunId: asSuiteRunId(this.createId("suite")),
      suiteName: this.name,
      areas: this.areas,
      outcome,
      score,
      maxScore,
      issues,
      durationMs: this.clockMs() - start,
    });
  }
}
