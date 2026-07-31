/**
 * Persist validation report bundle to disk.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ValidationReportBundle } from "../contracts";

const REPORT_FILES: Readonly<
  Record<
    keyof Pick<
      ValidationReportBundle,
      | "validationReportMd"
      | "endToEndReportMd"
      | "securityReportMd"
      | "loadTestReportMd"
      | "failureReportMd"
      | "recoveryReportMd"
      | "performanceReportMd"
      | "coverageReportMd"
      | "certificationReportMd"
    >,
    string
  >
> = {
  validationReportMd: "VALIDATION_REPORT.md",
  endToEndReportMd: "END_TO_END_REPORT.md",
  securityReportMd: "SECURITY_REPORT.md",
  loadTestReportMd: "LOAD_TEST_REPORT.md",
  failureReportMd: "FAILURE_REPORT.md",
  recoveryReportMd: "RECOVERY_REPORT.md",
  performanceReportMd: "PERFORMANCE_REPORT.md",
  coverageReportMd: "COVERAGE_REPORT.md",
  certificationReportMd: "CERTIFICATION_REPORT.md",
};

export function writeReportBundleToDirectory(
  bundle: ValidationReportBundle,
  directory: string
): void {
  fs.mkdirSync(directory, { recursive: true });
  for (const [key, filename] of Object.entries(REPORT_FILES)) {
    const content = bundle[key as keyof typeof REPORT_FILES];
    fs.writeFileSync(path.join(directory, filename), content, "utf8");
  }
}
