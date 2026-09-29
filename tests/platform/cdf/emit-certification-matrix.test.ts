import { writeFileSync } from "fs";
import { join } from "path";
import {
  certifyNegativeEligibilityFixtures,
  projectPresentationEligibility,
  runFullExecutionCertification,
  executionCertificationSummaryToJson,
} from "../../../src/platform/cdf/conformance/execution-certification-matrix";
import { resetCdfSessionsForTests } from "../../../src/platform/cdf/session-store";
import { resetCdfArtifactEngineForTests } from "../../../src/platform/cdf/artifacts";

describe("emit certification matrix artifacts", () => {
  it("writes JSON and MD to repo root with explicit certification levels", () => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
    const { rows, summary } = runFullExecutionCertification();
    const root = join(__dirname, "../../../../");
    const jsonPath = join(root, "CDF_EXECUTION_CERTIFICATION_MATRIX.json");
    const mdPath = join(root, "CDF_EXECUTION_CERTIFICATION_MATRIX.md");
    const negatives = certifyNegativeEligibilityFixtures();
    const payload = {
      generatedAt: new Date().toISOString(),
      harnessMode: "deterministic",
      certificationLevels: {
        CONTRACT_WIRED: summary.byStatus.CONTRACT_WIRED,
        EXECUTION_CERTIFIED: summary.byStatus.EXECUTION_CERTIFIED,
        LIVE_PROVIDER_CERTIFIED: summary.byStatus.LIVE_PROVIDER_CERTIFIED,
        FAILED: summary.byStatus.FAILED,
      },
      liveProviderStatus: "NOT_RUN",
      negativeEligibilityFixtures: negatives,
      summary: executionCertificationSummaryToJson(summary),
      rows,
    };
    writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
    const lines = [
      "# CDF Execution Certification Matrix",
      "",
      `Generated: ${payload.generatedAt}`,
      "",
      "## Certification levels",
      "",
      "Deterministic harness only. Do **not** read EXECUTION_CERTIFIED as LIVE_PROVIDER_CERTIFIED.",
      "",
      `- harnessMode: \`${summary.harnessMode}\``,
      `- CONTRACT_WIRED: ${summary.byStatus.CONTRACT_WIRED}`,
      `- EXECUTION_CERTIFIED (deterministic): ${summary.byStatus.EXECUTION_CERTIFIED} / ${summary.idealTargetCertified}`,
      `- LIVE_PROVIDER_CERTIFIED: ${summary.byStatus.LIVE_PROVIDER_CERTIFIED} (NOT RUN)`,
      `- FAILED: ${summary.byStatus.FAILED}`,
      "",
      "## Eligibility dimensions",
      "",
      "Each row exposes independently:",
      "",
      "- `canonicalArtifactCreated`",
      "- `structuralAcceptance`",
      "- `presentationEligibility`",
      "",
      "DIAGNOSTIC_PREVIEW_AVAILABLE with canonicalArtifactCreated=true is a valid deterministic result.",
      "",
      "## Negative eligibility fixtures",
      "",
      `- structurallyRejectedVisualIsNotAvailable: ${negatives.structurallyRejectedVisualIsNotAvailable}`,
      `- rawArtIsNotCanonical: ${negatives.rawArtIsNotCanonical}`,
      `- rejected → eligibility: ${negatives.presentationEligibility}`,
      "",
      "## Failures",
      "",
    ];
    if (summary.failures.length === 0) {
      lines.push("_None_");
    } else {
      for (const f of summary.failures) {
        lines.push(
          `- **${f.service}.${f.phase}** — divergence=\`${f.firstDivergence}\` — ${f.failureReason}`,
        );
      }
    }
    lines.push("", "## Rows", "");
    lines.push(
      "| service | phase | modality | result | canonical | structural | eligibility | restartSafe | divergence |",
    );
    lines.push("|---|---|---|---|---|---|---|---|---|");
    for (const r of rows) {
      lines.push(
        `| ${r.service} | ${r.phase} | ${r.modality} | ${r.result} | ${r.canonicalArtifactCreated} | ${r.structuralAcceptance} | ${r.presentationEligibility ?? ""} | ${r.restartSafe} | ${r.firstDivergence ?? ""} |`,
      );
    }
    writeFileSync(mdPath, lines.join("\n") + "\n");
    expect(rows.length).toBe(summary.registryPhaseCount);
    expect(summary.byStatus.LIVE_PROVIDER_CERTIFIED).toBe(0);
    expect(summary.harnessMode).toBe("deterministic");
    expect(negatives.structurallyRejectedVisualIsNotAvailable).toBe(true);
    expect(negatives.rawArtIsNotCanonical).toBe(true);
    expect(
      projectPresentationEligibility({
        accepted: false,
        modality: "image",
        hasVaultPreview: true,
        structuralAcceptance: "REJECTED",
      }),
    ).toBe("DIAGNOSTIC_PREVIEW_AVAILABLE");
  });
});
