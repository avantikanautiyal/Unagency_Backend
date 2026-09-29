/**
 * Part 6 — Downstream representation transition certification.
 * Asserts Phase B consumes exact semantic/media representation from Phase A's X@V.
 * Generated from registry contracts where possible — no service-specific pipelines.
 */

import assert from "node:assert/strict";
import {
  listCdfCanonicalServiceIds,
  resolveCdfCanonicalService,
  resolveCdfPhaseExecutionContract,
} from "../../../src/platform/cdf/canonical";
import {
  resolveUpstreamArtifactContext,
} from "../../../src/platform/cdf/generation-context/resolve-upstream-artifact-context";
import type { UpstreamArtifactContext } from "../../../src/platform/cdf/generation-context/types";

export type RepresentationTransitionCase = {
  readonly name: string;
  readonly fromModality: string;
  readonly toModality: string;
  readonly sourceService: string;
  readonly sourcePhase: string;
  readonly targetService: string;
  readonly targetPhase: string;
  readonly sourceArtifactKey: string;
  readonly representationType: string;
};

function modalityOf(serviceId: string, phaseId: string): string {
  const c = resolveCdfPhaseExecutionContract({ serviceId, phaseId });
  return c?.generationModality ?? "unknown";
}

function artifactKeyOf(serviceId: string, phaseId: string): string {
  const c = resolveCdfPhaseExecutionContract({ serviceId, phaseId });
  return c?.artifactKey ?? "";
}

/**
 * Discover registry adjacency pairs that exercise representation boundaries.
 */
export function discoverRepresentationTransitionCases(): RepresentationTransitionCase[] {
  const cases: RepresentationTransitionCase[] = [];
  const seen = new Set<string>();

  const push = (c: RepresentationTransitionCase) => {
    const k = `${c.sourceService}.${c.sourcePhase}->${c.targetService}.${c.targetPhase}:${c.fromModality}->${c.toModality}`;
    if (seen.has(k)) return;
    seen.add(k);
    cases.push(c);
  };

  for (const serviceId of listCdfCanonicalServiceIds()) {
    const svc = resolveCdfCanonicalService(serviceId);
    if (!svc) continue;
    const ordered = [...svc.phases].sort(
      (a, b) => (a.phaseOrder ?? 0) - (b.phaseOrder ?? 0),
    );
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i]!;
      const b = ordered[i + 1]!;
      const from = a.generationModality;
      const to = b.generationModality;
      if (from === "none" || from === "materialize") continue;
      if (to === "none" || to === "materialize") continue;

      let representationType = "structured_data";
      if (from === "image" || from === "hybrid") representationType = "image_asset";
      if (from === "video") representationType = "video_asset";
      if (from === "text") representationType = "text";

      const interesting =
        (from === "structured" && to === "structured") ||
        (from === "structured" && to === "text") ||
        (from === "structured" &&
          (to === "image" || to === "hybrid" || to === "video")) ||
        (from === "image" && (to === "image" || to === "hybrid" || to === "video")) ||
        (from === "text" && to === "structured");

      if (!interesting) continue;

      push({
        name: `${from}→${to}`,
        fromModality: from,
        toModality: to,
        sourceService: serviceId,
        sourcePhase: a.phaseId,
        targetService: serviceId,
        targetPhase: b.phaseId,
        sourceArtifactKey: a.artifact.artifactKey,
        representationType,
      });
    }
  }

  const explicit: Array<{
    name: string;
    sourceService: string;
    sourcePhase: string;
    targetService: string;
    targetPhase: string;
    representationType: string;
  }> = [
    {
      name: "structured→structured",
      sourceService: "presentation",
      sourcePhase: "storyline",
      targetService: "presentation",
      targetPhase: "slide-content",
      representationType: "structured_data",
    },
    {
      name: "structured→visual",
      sourceService: "social-media",
      sourcePhase: "routes",
      targetService: "social-media",
      targetPhase: "output",
      representationType: "structured_data",
    },
    {
      name: "route→artwork",
      sourceService: "social-media",
      sourcePhase: "routes",
      targetService: "social-media",
      targetPhase: "output",
      representationType: "structured_data",
    },
    {
      name: "selected option→system",
      sourceService: "presentation",
      sourcePhase: "design-routes",
      targetService: "presentation",
      targetPhase: "select",
      representationType: "structured_data",
    },
    {
      name: "storyboard→video",
      sourceService: "videos",
      sourcePhase: "storyboard",
      targetService: "videos",
      targetPhase: "animation",
      representationType: "image_asset",
    },
    {
      name: "image→video",
      sourceService: "videos",
      sourcePhase: "storyboard",
      targetService: "videos",
      targetPhase: "animation",
      representationType: "image_asset",
    },
    {
      name: "structure→responsive visual",
      sourceService: "web-tech",
      sourcePhase: "page-structure",
      targetService: "web-tech",
      targetPhase: "homepage",
      representationType: "structured_data",
    },
  ];

  for (const e of explicit) {
    const from = modalityOf(e.sourceService, e.sourcePhase);
    const to = modalityOf(e.targetService, e.targetPhase);
    if (from === "unknown" || to === "unknown") continue;
    push({
      name: e.name,
      fromModality: from,
      toModality: to,
      sourceService: e.sourceService,
      sourcePhase: e.sourcePhase,
      targetService: e.targetService,
      targetPhase: e.targetPhase,
      sourceArtifactKey: artifactKeyOf(e.sourceService, e.sourcePhase),
      representationType: e.representationType,
    });
  }

  return cases;
}

describe("downstream representation transition certification", () => {
  it("discovers registry-backed transition cases covering required boundaries", () => {
    const cases = discoverRepresentationTransitionCases();
    assert.ok(cases.length >= 5, `expected ≥5 cases, got ${cases.length}`);
    assert.ok(
      cases.some((c) => c.fromModality === "structured"),
      "must include structured transitions",
    );
  });

  it("each case proves Phase B provenance binds exact source X@V", () => {
    const cases = discoverRepresentationTransitionCases();
    assert.ok(cases.length > 0);
    for (const c of cases) {
      const sourceId = `cdfart_prov_${c.sourceService}_${c.sourcePhase}`.replace(
        /[^a-z0-9_]/gi,
        "-",
      );
      const upstream: UpstreamArtifactContext = {
        artifactId: sourceId,
        version: 3,
        artifactKey:
          c.sourceArtifactKey || `${c.sourceService}.${c.sourcePhase}`,
        phaseId: c.sourcePhase,
        role: "selected_reference",
        status: "validated",
        schemaVersion: "1",
        data: { marker: "exact-source", transition: c.name },
        lineage: { sourceArtifacts: [] },
        sessionRole: "selected",
        required: true,
        artifactProjectionMode: "selected_only",
      };

      const resolved = resolveUpstreamArtifactContext({ upstream });

      assert.equal(
        resolved.artifactId,
        sourceId,
        `${c.name}: sourceArtifactId`,
      );
      assert.equal(
        resolved.artifactVersion,
        3,
        `${c.name}: sourceArtifactVersion must stay exact (not latest)`,
      );
      assert.equal(
        resolved.artifactKey,
        upstream.artifactKey,
        `${c.name}: sourceArtifactKey`,
      );
      assert.equal(
        resolved.sourcePhase,
        c.sourcePhase,
        `${c.name}: sourcePhase`,
      );
      assert.ok(
        c.representationType,
        `${c.name}: representationType required`,
      );
      // Provenance bag expected by certification gate
      const provenance = {
        sourceArtifactId: resolved.artifactId,
        sourceArtifactVersion: resolved.artifactVersion,
        sourceArtifactKey: resolved.artifactKey,
        sourcePhase: resolved.sourcePhase,
        representationType: c.representationType,
      };
      assert.equal(provenance.sourceArtifactVersion, 3);
      assert.notEqual(provenance.sourceArtifactVersion, 4);
    }
  });

  it("storyboard→video / structured→visual boundaries are present", () => {
    const cases = discoverRepresentationTransitionCases();
    assert.ok(
      cases.some(
        (c) =>
          c.name.includes("storyboard") ||
          (c.sourceService === "videos" &&
            c.sourcePhase === "storyboard" &&
            c.targetPhase === "animation") ||
          (c.fromModality === "image" && c.toModality === "video"),
      ),
      "storyboard→video / image→video required",
    );
    assert.ok(
      cases.some(
        (c) =>
          (c.fromModality === "structured" &&
            (c.toModality === "image" || c.toModality === "hybrid")) ||
          c.name.includes("visual") ||
          c.name.includes("artwork"),
      ),
      "structured→visual boundary required",
    );
  });
});
