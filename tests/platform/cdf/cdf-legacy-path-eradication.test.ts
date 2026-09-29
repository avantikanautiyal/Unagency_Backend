/**
 * Regression: eradicated legacy paths must stay unreachable.
 * Proves old kill-switches / dead executors cannot resurrect parallel CDF completion.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  isPackagingCanonicalDownloadEnabled,
  isPackagingCanonicalIngestEnabled,
  isSocialMediaCanonicalDownloadEnabled,
  isSocialMediaCanonicalIngestEnabled,
  shouldSkipLegacyPresentationExport,
  SOCIAL_MEDIA_RENDER_CONTRACT,
  PACKAGING_RENDER_CONTRACT,
} from "../../../src/platform/cdf";

describe("CDF legacy-path eradication regressions", () => {
  const prevEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [
      "CDF_SOCIAL_MEDIA_FORCE_LEGACY_ONLY",
      "CDF_SOCIAL_MEDIA_FORCE_LEGACY_DOWNLOAD",
      "CDF_SOCIAL_MEDIA_INGEST",
      "CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD",
      "CDF_PACKAGING_FORCE_LEGACY_ONLY",
      "CDF_PACKAGING_FORCE_LEGACY_DOWNLOAD",
      "CDF_PACKAGING_INGEST",
      "CDF_PACKAGING_CANONICAL_DOWNLOAD",
      "CDF_PRESENTATION_FORCE_LEGACY_EXPORT",
    ]) {
      prevEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("1 — dead unlocked transition-service.legacy.ts is gone", () => {
    const p = path.join(
      __dirname,
      "../../../src/platform/cdf/transition-service.legacy.ts",
    );
    expect(fs.existsSync(p)).toBe(false);
  });

  it("2 — dead service-configs.legacy snapshots are gone", () => {
    expect(
      fs.existsSync(
        path.join(
          __dirname,
          "../../../src/platform/cdf/service-configs.legacy.ts",
        ),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          __dirname,
          "../../../../../Unagency-frontend/packages/api/src/domain/cdf-service-configs.legacy.ts",
        ),
      ),
    ).toBe(false);
  });

  it("3 — FORCE_LEGACY_ONLY cannot disable Social Media ingest", () => {
    process.env.CDF_SOCIAL_MEDIA_INGEST = "1";
    process.env.CDF_SOCIAL_MEDIA_FORCE_LEGACY_ONLY = "1";
    expect(isSocialMediaCanonicalIngestEnabled()).toBe(true);
  });

  it("4 — FORCE_LEGACY_DOWNLOAD cannot disable Social Media canonical download", () => {
    process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD = "1";
    process.env.CDF_SOCIAL_MEDIA_FORCE_LEGACY_DOWNLOAD = "1";
    expect(isSocialMediaCanonicalDownloadEnabled()).toBe(true);
  });

  it("5 — FORCE_LEGACY_ONLY cannot disable Packaging ingest", () => {
    process.env.CDF_PACKAGING_INGEST = "1";
    process.env.CDF_PACKAGING_FORCE_LEGACY_ONLY = "1";
    expect(isPackagingCanonicalIngestEnabled()).toBe(true);
  });

  it("6 — FORCE_LEGACY_DOWNLOAD cannot disable Packaging canonical download", () => {
    process.env.CDF_PACKAGING_CANONICAL_DOWNLOAD = "1";
    process.env.CDF_PACKAGING_FORCE_LEGACY_DOWNLOAD = "1";
    expect(isPackagingCanonicalDownloadEnabled()).toBe(true);
  });

  it("7 — FORCE_LEGACY_EXPORT cannot keep legacy presentation export when canonical", () => {
    process.env.CDF_PRESENTATION_FORCE_LEGACY_EXPORT = "1";
    expect(
      shouldSkipLegacyPresentationExport({
        metadata: { cdfSessionId: "cdf_x", cdfPhaseId: "full-deck" },
        canonicalAttached: true,
      }),
    ).toBe(true);
  });

  it("8 — render contracts no longer advertise forceLegacyDownload flags", () => {
    expect(
      (SOCIAL_MEDIA_RENDER_CONTRACT.stranglerFlags as Record<string, string>)
        .forceLegacyDownload,
    ).toBeUndefined();
    expect(
      (PACKAGING_RENDER_CONTRACT.stranglerFlags as Record<string, string>)
        .forceLegacyDownload,
    ).toBeUndefined();
  });

  it("9 — CMR placeholder cannot be imported as a UI candidate factory", () => {
    const types = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/ai/canonical-model-request/types.ts",
      ),
      "utf8",
    );
    expect(types).toContain("[unagency:canonical_model_request]");
    // Placeholder is a prompt SoT marker — not a candidate builder.
    expect(types).not.toMatch(/createCandidate|Route 1|syntheticCandidate/);
  });

  it("11 — legacyGenerator field eradicated from registry and phase type", () => {
    const registry = fs.readFileSync(
      path.join(
        __dirname,
        "../../../../Unagency-frontend/packages/api/src/domain/cdf/registry.ts",
      ),
      "utf8",
    );
    expect(registry).not.toMatch(/legacyGenerator\s*:/);
    const phaseBuilders = fs.readFileSync(
      path.join(
        __dirname,
        "../../../../Unagency-frontend/packages/api/src/domain/cdf/phase-builders.ts",
      ),
      "utf8",
    );
    expect(phaseBuilders).not.toMatch(/legacyGenerator:/);
  });

  it("10 — no production import of deleted legacy transition/config snapshots", () => {
    const cdfRoot = path.join(__dirname, "../../../src/platform/cdf");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) out.push(...walk(p));
        else if (ent.name.endsWith(".ts")) out.push(p);
      }
      return out;
    };
    for (const file of walk(cdfRoot)) {
      if (file.endsWith(".legacy.ts")) continue;
      const src = fs.readFileSync(file, "utf8");
      expect(src).not.toMatch(
        /from\s+['"][^'"]*transition-service\.legacy['"]/,
      );
      expect(src).not.toMatch(
        /from\s+['"][^'"]*service-configs\.legacy['"]/,
      );
      expect(src).not.toMatch(
        /require\(['"][^'"]*transition-service\.legacy['"]\)/,
      );
      expect(src).not.toMatch(
        /require\(['"][^'"]*service-configs\.legacy['"]\)/,
      );
    }
  });
});
