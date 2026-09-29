import assert from "node:assert/strict";
import { assertDeepOverlayRegistryConformance } from "../../../src/platform/cdf/conformance/deep-overlay-registry";

describe("CDF Class-A overlay registry conformance", () => {
  it("derives every overlay mapping from a live canonical service/phase/artifact relationship", () => {
    assert.doesNotThrow(() => assertDeepOverlayRegistryConformance());
  });
});
