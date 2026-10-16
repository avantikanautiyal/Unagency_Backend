/**
 * A chat refine ("make it horizontal") of a generated creative must complete
 * as its own ArtifactVersion — never replay the refined execution's.
 *
 * Live defect (exec_2259 refining exec_2228): the refine inherited
 * cdfCanonicalCompletionEstablished + cdfArtifactId through continuity, so
 * ingest replayed exec_2228's artifact; approve and Download Mockup then
 * delivered the original creative instead of the approved refinement.
 */

import { resolveEstablishedCanonicalCompletionAttach } from "../../../src/platform/api/services/execution-cdf-canonical-ingest";

const inheritedStamp = {
  cdfCanonicalCompletionEstablished: true,
  cdfArtifactId: "cdfart_orig_merchandise-product-mockup",
  cdfArtifactVersion: 1,
  cdfArtifactKey: "merchandise.product-mockup",
};

describe("refine completion identity", () => {
  it("refine does not replay the refined execution's inherited stamp", () => {
    const attach = resolveEstablishedCanonicalCompletionAttach(
      { ...inheritedStamp, refineFromExecutionId: "exec_orig" },
      "exec_refine",
    );
    expect(attach).toBeNull();
  });

  it("stamp owned by another execution is not this execution's completion", () => {
    const attach = resolveEstablishedCanonicalCompletionAttach(
      { ...inheritedStamp, cdfCanonicalExecutionId: "exec_orig" },
      "exec_refine",
    );
    expect(attach).toBeNull();
  });

  it("same-execution duplicate completion still replays", () => {
    const attach = resolveEstablishedCanonicalCompletionAttach(
      { ...inheritedStamp, cdfCanonicalExecutionId: "exec_orig" },
      "exec_orig",
    );
    expect(attach?.cdfArtifactId).toBe(inheritedStamp.cdfArtifactId);
  });

  it("legacy stamp without owner or refine source still replays", () => {
    const attach = resolveEstablishedCanonicalCompletionAttach(
      { ...inheritedStamp },
      "exec_orig",
    );
    expect(attach?.cdfArtifactId).toBe(inheritedStamp.cdfArtifactId);
  });
});
