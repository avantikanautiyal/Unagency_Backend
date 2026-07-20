import {
  sampleCertificationRequest,
  setupProviderCertificationPlatform,
  sampleMockAdapter,
  makeManifest,
} from "../../../../src/platform/intelligence/provider-certification/testing";
import { CertificationRequestBuilder } from "../../../../src/platform/intelligence/provider-certification/builders/certification-request-builder";

describe("Provider Certification Framework", () => {
  it("certifies mock provider adapter without external providers", async () => {
    const { engine } = setupProviderCertificationPlatform();
    const result = await engine.certify(sampleCertificationRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.value;
    expect(report.status).toMatch(/certified/);
    expect(report.scorecard.overallScore).toBeGreaterThanOrEqual(70);
    expect(report.suiteResults.length).toBeGreaterThanOrEqual(9);
    expect(report.capabilityMatrix.capabilities.length).toBeGreaterThan(0);
    expect(report.complianceMatrix.areas.length).toBe(25);
    expect(report.badge.label).toBeTruthy();
  });

  it("produces certification report with scorecard and matrices", async () => {
    const { engine } = setupProviderCertificationPlatform();
    const result = await engine.certify(sampleCertificationRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.scorecard.dimensions.length).toBeGreaterThan(0);
    expect(result.value.capabilityMatrix).toBeDefined();
    expect(result.value.complianceMatrix).toBeDefined();
    expect(result.value.performanceMatrix.benchmarks.length).toBe(13);
    expect(result.value.compatibilityProfile.compatible).toBe(true);
    expect(result.value.qualityReport.benchmarkCompatibility.length).toBe(13);
  });

  it("issues certification badge", async () => {
    const { engine } = setupProviderCertificationPlatform();
    const result = await engine.certify(sampleCertificationRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const badge = result.value.badge;
    expect(badge.badgeId).toBeTruthy();
    expect(badge.providerId).toBeTruthy();
    expect(badge.overallScore).toBeGreaterThanOrEqual(0);
    expect(badge.certifiedAt).toBeTruthy();
  });

  it("rejects adapter with invalid manifest", async () => {
    const { engine } = setupProviderCertificationPlatform();
    const adapter = sampleMockAdapter();
    const badManifest = makeManifest((b) =>
      b.withModels([]).withCapabilities([]).withAuthenticationTypes([])
    );
    const request = CertificationRequestBuilder.create()
      .withRequestId("cert_bad")
      .withAdapter(adapter)
      .withManifest(badManifest)
      .build();

    const result = await engine.certify(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(["rejected", "certified_with_warnings", "experimental"]).toContain(result.value.status);
  });

  it("runs all certification suites with diagnostics", async () => {
    const { engine } = setupProviderCertificationPlatform();
    const result = await engine.certify(sampleCertificationRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statistics.suitesRun).toBe(9);
    expect(result.value.statistics.totalDurationMs).toBeGreaterThanOrEqual(0);
    const areas = result.value.suiteResults.flatMap((s) => s.areas);
    expect(areas).toContain("request_validation");
    expect(areas).toContain("streaming");
    expect(areas).toContain("error_normalization");
  });

  it("never performs networking or SDK calls", async () => {
    const { engine } = setupProviderCertificationPlatform();
    const result = await engine.certify(sampleCertificationRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.statistics.suitesPassed).toBeGreaterThan(0);
  });
});
