import * as fs from "node:fs";
import * as path from "node:path";
import {
  setupValidationPlatform,
  sampleValidationRunRequest,
} from "../../../src/platform/validation/testing";
import { writeReportBundleToDirectory } from "../../../src/platform/validation/reports/write-reports";

describe("Validation report artifacts", () => {
  it("writes nine deliverable markdown reports", async () => {
    const { orchestrator } = await setupValidationPlatform();
    const bundle = await orchestrator.runWithReports(
      sampleValidationRunRequest({
        runId: "val_artifacts",
        scenarioIds: ["gateway_e2e", "research_merge"],
        includeSecurityValidation: true,
        includeLoadTesting: true,
        loadProfile: "load_10",
      })
    );
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) return;

    const outDir = path.join(
      __dirname,
      "../../../src/platform/validation/documentation"
    );
    writeReportBundleToDirectory(bundle.value, outDir);

    for (const name of [
      "VALIDATION_REPORT.md",
      "END_TO_END_REPORT.md",
      "SECURITY_REPORT.md",
      "LOAD_TEST_REPORT.md",
      "FAILURE_REPORT.md",
      "RECOVERY_REPORT.md",
      "PERFORMANCE_REPORT.md",
      "COVERAGE_REPORT.md",
      "CERTIFICATION_REPORT.md",
    ]) {
      const file = path.join(outDir, name);
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.readFileSync(file, "utf8").length).toBeGreaterThan(50);
    }
  }, 120000);
});
