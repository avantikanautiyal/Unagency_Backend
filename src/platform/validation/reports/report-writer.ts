/**
 * Markdown report writer — generates all production readiness deliverables.
 */

import type { ValidationReportBundle, ValidationRunReport } from "../contracts";

function header(title: string): string {
  return `# ${title}\n\nGenerated: ${new Date().toISOString()}\n\n`;
}

function checkTable(checks: ValidationRunReport["checks"]): string {
  if (!checks.length) return "_No checks recorded._\n";
  const rows = checks.map(
    (c) => `| ${c.checkId} | ${c.area} | ${c.status} | ${c.message.replace(/\|/g, "\\|")} |`
  );
  return `| Check | Area | Status | Message |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`;
}

export function buildValidationReportMd(report: ValidationRunReport): string {
  let md = header("VALIDATION REPORT");
  md += `**Run ID:** ${report.runId}\n`;
  md += `**Success:** ${report.success}\n`;
  md += `**Duration:** ${report.durationMs}ms\n\n`;
  md += `## Scenarios\n\n`;
  for (const s of report.scenarios) {
    md += `- **${s.scenarioId}**: ${s.success ? "PASS" : "FAIL"} (${s.stages.length} stages)\n`;
  }
  md += `\n## Checks\n\n${checkTable(report.checks)}`;
  return md;
}

export function buildEndToEndReportMd(report: ValidationRunReport): string {
  let md = header("END TO END REPORT");
  for (const s of report.scenarios) {
    md += `## ${s.scenarioId}\n\n`;
    for (const stage of s.stages) {
      md += `### ${stage.name} — ${stage.status}\n`;
      md += `- Duration: ${stage.durationMs}ms\n`;
      md += `- Checks: ${stage.checks.length}\n\n`;
    }
  }
  return md;
}

export function buildSecurityReportMd(report: ValidationRunReport): string {
  let md = header("SECURITY REPORT");
  const passed = report.securityResults.filter((r) => r.passed).length;
  md += `**Passed:** ${passed}/${report.securityResults.length}\n\n`;
  md += `| Check | Passed | Message |\n| --- | --- | --- |\n`;
  for (const r of report.securityResults) {
    md += `| ${r.checkId} | ${r.passed} | ${r.message} |\n`;
  }
  return md;
}

export function buildLoadTestReportMd(report: ValidationRunReport): string {
  let md = header("LOAD TEST REPORT");
  const m = report.loadMetrics;
  if (!m) {
    md += "_Load testing not included in this run._\n";
    return md;
  }
  md += `| Metric | Value |\n| --- | --- |\n`;
  md += `| Profile | ${m.profile} |\n`;
  md += `| Executions | ${m.executionCount} |\n`;
  md += `| Avg Latency | ${m.averageLatencyMs}ms |\n`;
  md += `| P95 | ${m.p95LatencyMs}ms |\n`;
  md += `| P99 | ${m.p99LatencyMs}ms |\n`;
  md += `| Queue Wait | ${m.queueWaitMs}ms |\n`;
  md += `| Success Rate | ${m.successRate}% |\n`;
  md += `| Provider Latency | ${m.providerLatencyMs}ms |\n`;
  return md;
}

export function buildFailureReportMd(report: ValidationRunReport): string {
  let md = header("FAILURE REPORT");
  const passed = report.failureSimulations.filter((f) => f.passed).length;
  md += `**Simulations passed:** ${passed}/${report.failureSimulations.length}\n\n`;
  md += `| Kind | Passed | Expected Recovery |\n| --- | --- | --- |\n`;
  for (const f of report.failureSimulations) {
    md += `| ${f.kind} | ${f.passed} | ${f.expectedRecovery} |\n`;
  }
  return md;
}

export function buildRecoveryReportMd(report: ValidationRunReport): string {
  let md = header("RECOVERY REPORT");
  for (const t of report.recoveryTests) {
    md += `- **${t.name}** (${t.testId}): ${t.passed ? "PASS" : "FAIL"} — ${t.notes}\n`;
  }
  return md;
}

export function buildPerformanceReportMd(report: ValidationRunReport): string {
  let md = header("PERFORMANCE REPORT");
  md += `**Run duration:** ${report.durationMs}ms\n\n`;
  if (report.loadMetrics) {
    const m = report.loadMetrics;
    md += `Load profile **${m.profile}**: avg ${m.averageLatencyMs}ms, P95 ${m.p95LatencyMs}ms, P99 ${m.p99LatencyMs}ms\n`;
  }
  const scenarioLatencies = report.scenarios.flatMap((s) =>
    s.stages.map((st) => st.durationMs)
  );
  if (scenarioLatencies.length) {
    const avg =
      scenarioLatencies.reduce((a, b) => a + b, 0) / scenarioLatencies.length;
    md += `**Scenario stage average:** ${avg.toFixed(2)}ms\n`;
  }
  return md;
}

export function buildCoverageReportMd(report: ValidationRunReport): string {
  const c = report.coverage;
  let md = header("COVERAGE REPORT");
  md += `| Metric | Value |\n| --- | --- |\n`;
  md += `| Scenarios | ${c.scenariosPassed}/${c.scenariosTotal} |\n`;
  md += `| Stages | ${c.stagesValidated}/${c.stagesTotal} |\n`;
  md += `| APIs | ${c.apisCovered.length} |\n`;
  md += `| Modules | ${c.modulesConsumed.length} |\n\n`;
  md += `### APIs Covered\n\n${c.apisCovered.map((a) => `- ${a}`).join("\n")}\n\n`;
  md += `### Modules Consumed\n\n${c.modulesConsumed.map((m) => `- ${m}`).join("\n")}\n`;
  return md;
}

export function buildCertificationReportMd(report: ValidationRunReport): string {
  const cert = report.certification;
  let md = header("CERTIFICATION REPORT");
  md += `## Overall Production Readiness: **${cert.overallPercent}%** (Grade ${cert.grade})\n\n`;
  md += `Certified at: ${cert.certifiedAt}\n\n`;
  md += `| Dimension | Score | Passed |\n| --- | --- | --- |\n`;
  for (const d of cert.dimensions) {
    md += `| ${d.dimension} | ${d.scorePercent}% | ${d.passed} |\n`;
  }
  return md;
}

export function buildReportBundle(report: ValidationRunReport): ValidationReportBundle {
  return {
    runReport: report,
    validationReportMd: buildValidationReportMd(report),
    endToEndReportMd: buildEndToEndReportMd(report),
    securityReportMd: buildSecurityReportMd(report),
    loadTestReportMd: buildLoadTestReportMd(report),
    failureReportMd: buildFailureReportMd(report),
    recoveryReportMd: buildRecoveryReportMd(report),
    performanceReportMd: buildPerformanceReportMd(report),
    coverageReportMd: buildCoverageReportMd(report),
    certificationReportMd: buildCertificationReportMd(report),
  };
}
