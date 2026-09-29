/**
 * Backend consumes the same canonical registry as FE (hash equality).
 */

import {
  computeCdfContractHash,
  getCdfCanonicalRegistry,
  listCdfCanonicalServiceIds,
  resolveCdfServiceConfig,
  validateCdfCanonicalRegistry,
} from "../../../src/platform/cdf";

describe("CDF 2.0 canonical contract — backend consumer", () => {
  it("resolves the same 15 services as the canonical registry", () => {
    const ids = listCdfCanonicalServiceIds();
    expect(ids).toHaveLength(15);
    for (const id of ids) {
      expect(resolveCdfServiceConfig(id)?.serviceId).toBe(id);
    }
  });

  it("validates the shared registry", () => {
    expect(validateCdfCanonicalRegistry(getCdfCanonicalRegistry())).toEqual([]);
  });

  it("exposes a stable contract hash for FE/BE drift detection", () => {
    const hash = computeCdfContractHash(getCdfCanonicalRegistry());
    expect(hash.startsWith("cdf2:2.0.0-m1:")).toBe(true);
    expect(computeCdfContractHash(getCdfCanonicalRegistry())).toBe(hash);
  });

  it("projects presentation with active slide-refinement; select still deferred", () => {
    const cfg = resolveCdfServiceConfig("presentation")!;
    const ids = cfg.phases.map((p) => p.id);
    expect(ids).not.toContain("select");
    expect(ids).toContain("slide-refinement");
    expect(ids).toContain("full-deck");
  });
});
