/**
 * Route / direction exploration prompts (the options a user picks from) carry
 * no production-constraints block. The canvas shape survives as
 * metadata.aspectRatio, which the image request reads into its payload.
 */

import {
  ensureProviderPromptHasProductionSpec,
  isRouteExplorationMetadata,
} from "../../../src/platform/config/format-production-spec";
import { resolveCanonicalAssemblyEnrichments } from "../../../src/platform/cdf/generation-context/resolve-assembly-enrichments";

const SOCIAL = { service: "social", subtype: "content-design", platform: "instagram" };
const PROMPT = "Create an Instagram post for DiVastra.";

describe("route prompts carry no production block", () => {
  it.each(["route_visual", "route_visual_refine", "visual_direction"])(
    "%s: prompt unchanged, aspect ratio kept in metadata",
    (productAction) => {
      const out = ensureProviderPromptHasProductionSpec({
        prompt: PROMPT,
        metadata: { ...SOCIAL, productAction },
      });
      expect(out.prompt).toBe(PROMPT);
      expect(out.injected).toBe(false);
      expect(out.metadata.aspectRatio).toBe("4:5");
      expect(out.metadata.productionSpecPromptOmitted).toBe("route_exploration");
    },
  );

  it("an aspect ratio the client chose is never overwritten", () => {
    const out = ensureProviderPromptHasProductionSpec({
      prompt: PROMPT,
      metadata: { ...SOCIAL, productAction: "route_visual", aspectRatio: "1:1" },
    });
    expect(out.metadata.aspectRatio).toBe("1:1");
  });

  it("final deliverables still get the production block", () => {
    const out = ensureProviderPromptHasProductionSpec({
      prompt: PROMPT,
      metadata: { ...SOCIAL, productAction: "direct_passthrough" },
    });
    expect(out.prompt).toContain("[production_constraints]");
  });

  it("recognises CDF route / option phases only", () => {
    for (const phase of ["routes", "design-routes", "ui-routes", "logo-options", "style-routes"]) {
      expect(isRouteExplorationMetadata({ cdfPhaseId: phase })).toBe(true);
    }
    for (const phase of ["output", "3d-direction", "complete-pack", "full-deck", "final"]) {
      expect(isRouteExplorationMetadata({ cdfPhaseId: phase })).toBe(false);
    }
  });

  it("CDF route phase: no production spec section, aspect ratio stamped", () => {
    const routes = resolveCanonicalAssemblyEnrichments({
      ...SOCIAL,
      cdfServiceId: "social-media",
      cdfPhaseId: "routes",
    });
    expect(routes.productionSpec).toBeUndefined();
    expect(routes.metadata.aspectRatio).toBe("4:5");

    const output = resolveCanonicalAssemblyEnrichments({
      ...SOCIAL,
      cdfServiceId: "social-media",
      cdfPhaseId: "output",
    });
    expect(output.productionSpec).toBeDefined();
  });
});
