import assert from "node:assert/strict";
import { collectContractUpstreamRefs } from "../../../src/platform/cdf/canonical-ingest/upstream-projection";
import { resetCdfSessionsForTests, saveCdfSession } from "../../../src/platform/cdf/session-store";
import type { CdfSessionState } from "../../../src/platform/cdf/types";

function session(): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId: "cdf_upstream_projection",
    serviceId: "emailers",
    contractVersion: "2.0.0-m1",
    sessionVersion: 1,
    status: "active",
    brief: "Newsletter",
    phaseIndex: 2,
    phaseId: "structure",
    approved: [],
    selected: [],
    masters: {},
    modeOwnership: "ai",
    productMode: "ai",
    createdAt: ts,
    updatedAt: ts,
    approvedArtifacts: [
      { artifactId: "cdfart_a", version: 2, phaseId: "full-copy", artifactKey: "emailers.full-copy", role: "approved" },
      { artifactId: "cdfart_c", version: 1, phaseId: "email-design", artifactKey: "emailers.email-design", role: "approved" },
    ],
    selectedArtifacts: [
      { artifactId: "cdfart_b", version: 1, phaseId: "copy-routes", artifactKey: "emailers.copy-routes", role: "selected" },
      { artifactId: "cdfart_d", version: 3, phaseId: "email-design", artifactKey: "emailers.email-design", role: "selected" },
    ],
  };
}

describe("CDF completion upstream artifact projection", () => {
  beforeEach(() => resetCdfSessionsForTests());

  it("keeps only declared dependency A@V, excluding unrelated selected and approved pins", () => {
    saveCdfSession(session());
    assert.deepEqual(
      collectContractUpstreamRefs({
        sessionId: "cdf_upstream_projection",
        serviceId: "emailers",
        phaseId: "structure",
      }),
      [{ artifactId: "cdfart_a", version: 2, artifactKey: "emailers.full-copy" }],
    );
  });
});
