/**
 * Track A Phase A3 — post-guards: hard miss ≤1 retry; taste never auto-retries.
 */

import { BrandGuardEvaluator } from "../../../../src/platform/os/evaluation/evaluators/brand-guard";
import {
  classifyContinuityFindings,
  CONTINUITY_HARD_MISS_CODES,
  continuityPostGuardExtras,
  extractContinuityGuardContext,
  resolvePostGuardsRollout,
  runContinuityPostGuards,
  shouldHardRetry,
} from "../../../../src/platform/os/creative";
import type { BrandContextPacket } from "../../../../src/platform/os/creative";

function samplePacket(
  overrides: Partial<BrandContextPacket> = {}
): BrandContextPacket {
  return {
    schemaVersion: "brand_context_packet.v0",
    brandId: "brand_a3",
    assets: [
      {
        slot: "logo",
        assetId: "vault_logo_1",
        version: 1,
      },
    ],
    facts: [
      {
        key: "voice",
        value: "premium confident",
        tier: "canonical",
        provenance: "guidelines",
      },
    ],
    negatives: [{ text: "cheap", source: "guidelines" }],
    provenanceLine: "Logo vault_logo_1 · voice from guidelines",
    budgets: {
      maxAssets: 4,
      maxFacts: 8,
      maxFactTokens: 400,
    },
    missingRequiredSlots: [],
    ...overrides,
  };
}

describe("Track A Phase A3 continuity post-guards", () => {
  afterEach(() => {
    delete process.env.CONTINUITY_POST_GUARDS;
  });

  it("defaults CONTINUITY_POST_GUARDS to off", () => {
    expect(resolvePostGuardsRollout({})).toBe("off");
    expect(runContinuityPostGuards({
      organizationId: "org",
      executionId: "exec",
      capabilityId: "text.generate",
      preview: "hello",
      rollout: "off",
    })).toBeNull();
  });

  it("extracts avoid terms and logo from bound packet", () => {
    const ctx = extractContinuityGuardContext({
      continuityBound: true,
      brandContextPacket: samplePacket(),
    });
    expect(ctx.continuityBound).toBe(true);
    expect(ctx.brandAvoidTerms).toContain("cheap");
    expect(ctx.boundLogoAssetId).toBe("vault_logo_1");
    expect(ctx.brandTone).toMatch(/premium/i);
  });

  it("BrandGuard hard-fails avoid terms when continuity-bound", () => {
    const guard = new BrandGuardEvaluator();
    const result = guard.evaluate({
      organizationId: "org",
      executionId: "exec",
      planId: "plan",
      planVersion: 1,
      outputContractId: "output.copy",
      preview: "Our cheap sale starts today",
      brandAvoidTerms: ["cheap"],
      continuityBound: true,
      createId: (p) => `${p}_1`,
      nowIso: () => "2026-08-25T00:00:00.000Z",
    });
    expect(result.findings.some((f) => f.code === "BRAND_AVOID_TERM")).toBe(true);
    expect(CONTINUITY_HARD_MISS_CODES.has("BRAND_AVOID_TERM")).toBe(true);
  });

  it("tone mismatch is taste-only (suggest refine, not hard retry)", () => {
    const guard = new BrandGuardEvaluator();
    const result = guard.evaluate({
      organizationId: "org",
      executionId: "exec",
      planId: "plan",
      planVersion: 1,
      outputContractId: "output.copy",
      preview: "lol this product sucks but buy it",
      brandTone: "premium confident luxury",
      continuityBound: true,
      createId: (p) => `${p}_1`,
      nowIso: () => "2026-08-25T00:00:00.000Z",
    });
    const classified = classifyContinuityFindings(result.findings);
    expect(classified.tasteWarnings.some((f) => f.code === "BRAND_TONE_MISMATCH")).toBe(
      true
    );
    expect(classified.hardMisses).toEqual([]);
    expect(
      shouldHardRetry({ hardMisses: classified.hardMisses, retryCount: 0 })
    ).toBe(false);
  });

  it("shadow mode reports hard misses but does not recommend retry", () => {
    const report = runContinuityPostGuards({
      organizationId: "org",
      executionId: "exec",
      capabilityId: "text.generate",
      preview: "A cheap offer",
      metadata: {
        continuityBound: true,
        brandContextPacket: samplePacket(),
      },
      rollout: "shadow",
      retryCount: 0,
      createId: (p) => `${p}_1`,
      nowIso: () => "2026-08-25T00:00:00.000Z",
    });
    expect(report).not.toBeNull();
    expect(report!.hardMisses.some((f) => f.code === "BRAND_AVOID_TERM")).toBe(true);
    expect(report!.hardRetryRecommended).toBe(false);
  });

  it("on mode recommends hard retry once; second pass does not", () => {
    const first = runContinuityPostGuards({
      organizationId: "org",
      executionId: "exec",
      capabilityId: "text.generate",
      preview: "A cheap offer",
      metadata: {
        continuityBound: true,
        brandContextPacket: samplePacket(),
      },
      rollout: "on",
      retryCount: 0,
      createId: (p) => `${p}_1`,
      nowIso: () => "2026-08-25T00:00:00.000Z",
    });
    expect(first?.hardRetryRecommended).toBe(true);

    const second = runContinuityPostGuards({
      organizationId: "org",
      executionId: "exec",
      capabilityId: "text.generate",
      preview: "A cheap offer",
      metadata: {
        continuityBound: true,
        brandContextPacket: samplePacket(),
      },
      rollout: "on",
      retryCount: 1,
      createId: (p) => `${p}_1`,
      nowIso: () => "2026-08-25T00:00:00.000Z",
    });
    expect(second?.hardRetryRecommended).toBe(false);
    expect(shouldHardRetry({ hardMisses: second!.hardMisses, retryCount: 1 })).toBe(
      false
    );
  });

  it("taste-only findings set suggestRefine and never recommend hard retry", () => {
    const report = runContinuityPostGuards({
      organizationId: "org",
      executionId: "exec",
      capabilityId: "text.generate",
      preview: "omg lol this is cheap... wait no, premium vibes only lol",
      metadata: {
        continuityBound: true,
        brandContextPacket: samplePacket({
          negatives: [],
        }),
      },
      rollout: "on",
      retryCount: 0,
      createId: (p) => `${p}_1`,
      nowIso: () => "2026-08-25T00:00:00.000Z",
    });
    // Without avoid term "cheap" in negatives, tone mismatch alone
    expect(report?.hardMisses).toEqual([]);
    expect(report?.suggestRefine).toBe(true);
    expect(report?.hardRetryRecommended).toBe(false);

    const extras = continuityPostGuardExtras(report);
    expect(extras?.continuityPostGuards).toMatchObject({
      suggestRefine: true,
      hardRetryRecommended: false,
    });
  });

  it("bound image job without media → BRAND_BOUND_OUTPUT_MISSING hard miss", () => {
    const report = runContinuityPostGuards({
      organizationId: "org",
      executionId: "exec",
      capabilityId: "image.generate",
      preview: "Here is a description of an image with no bytes",
      metadata: {
        continuityBound: true,
        brandContextPacket: samplePacket(),
      },
      mediaArtifactIds: [],
      rollout: "on",
      retryCount: 0,
      createId: (p) => `${p}_1`,
      nowIso: () => "2026-08-25T00:00:00.000Z",
    });
    expect(
      report?.hardMisses.some((f) => f.code === "BRAND_BOUND_OUTPUT_MISSING")
    ).toBe(true);
    expect(report?.hardRetryRecommended).toBe(true);
  });
});
