/**
 * Recommendation generator from suite failures.
 */

import type { ImprovementRecommendation } from "../contracts/suite-result";
import type { SuiteResult } from "../contracts/suite-result";

export function buildRecommendations(
  suiteResults: readonly SuiteResult[]
): ImprovementRecommendation[] {
  const recommendations: ImprovementRecommendation[] = [];

  for (const suite of suiteResults) {
    for (const issue of suite.issues) {
      if (issue.severity === "error" || issue.severity === "warning") {
        recommendations.push({
          code: `rec_${issue.code}`,
          area: issue.area,
          priority: issue.severity === "error" ? "high" : "medium",
          recommendation: `Address ${issue.code}: ${issue.message}`,
        });
      }
    }
  }

  return recommendations;
}

export function buildFailureReport(
  suiteResults: readonly SuiteResult[],
  createId: (prefix: string) => string
): import("../contracts/suite-result").FailureReport | undefined {
  const failed = suiteResults.filter((s) => s.outcome === "fail");
  if (failed.length === 0) return undefined;

  const criticalIssues = failed.flatMap((s) =>
    s.issues.filter((i) => i.severity === "error")
  );

  return Object.freeze({
    reportId: createId("fail"),
    failedAreas: [...new Set(criticalIssues.map((i) => i.area))],
    criticalIssues,
    summary: `${failed.length} suite(s) failed certification`,
  });
}
