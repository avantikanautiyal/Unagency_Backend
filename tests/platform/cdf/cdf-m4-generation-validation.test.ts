/**
 * CDF M4 — Generation validation / requirement fidelity tests.
 */

import {
  applyCdfTransition,
  createArtifact,
  fixturePresentationDeck,
  fixturePresentationDesignSystem,
  fixturePresentationStoryline,
  getArtifactVersion,
  listValidationResults,
  markApproved,
  PRESENTATION_ARTIFACT_KEYS,
  resetCdfArtifactEngineForTests,
  resetCdfGenerationValidationForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  validateCanonicalArtifact,
  type CdfRequirement,
} from "../../../src/platform/cdf";

function req(partial: Partial<CdfRequirement> & Pick<CdfRequirement, "key" | "value" | "category" | "displayValue">): CdfRequirement {
  const ts = new Date().toISOString();
  return {
    requirementId: partial.requirementId ?? `req_${partial.key}`,
    sessionId: partial.sessionId ?? "sess",
    serviceId: partial.serviceId ?? "presentation",
    key: partial.key,
    value: partial.value,
    displayValue: partial.displayValue,
    category: partial.category,
    priority: partial.priority ?? "explicit_current_user_instruction",
    provenance: partial.provenance ?? {
      sourceInputId: "src_1",
      sourceType: "user_prompt",
      extractionMethod: "explicit",
      explicit: true,
      confidence: 1,
    },
    status: partial.status ?? "active",
    confidence: 1,
    explicit: true,
    createdAt: ts,
    updatedAt: ts,
    ...partial,
  };
}

describe("CDF M4 Generation Validation", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCdfGenerationValidationForTests();
  });

  function startSession() {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "presentation",
      productMode: "ai",
      organizationId: "org_a",
      projectId: "proj_a",
    });
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Create a 12-slide investor presentation. Audience: Series A investors. Tone: premium.",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    return briefed.value.session;
  }

  function makeDeck(sessionId: string, slideCount: number, opts?: {
    headline?: string;
    aspectRatio?: string;
    widthUnits?: number;
    heightUnits?: number;
    designSystemId?: string;
    forbiddenText?: string;
  }) {
    const ds = createArtifact({
      sessionId,
      serviceId: "presentation",
      phaseId: "select",
      organizationId: "org_a",
      projectId: "proj_a",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      artifactType: "structured_doc",
      data: fixturePresentationDesignSystem() as never,
    });
    const base = fixturePresentationDeck(opts?.designSystemId ?? ds.artifact.artifactId);
    // Expand/shrink slides to exact count while preserving stable ids where possible
    const template = base.slides[0]!;
    const slides = Array.from({ length: slideCount }, (_, i) => {
      const existing = base.slides[i];
      if (existing) {
        const copy = structuredClone(existing);
        copy.order = i;
        copy.id = `slide_${String(i + 1).padStart(2, "0")}`;
        if (i === 0 && opts?.headline) {
          const titleEl = copy.elements.find((e) => e.id === "element_title_01");
          if (titleEl && titleEl.type === "text") titleEl.content = opts.headline;
        }
        if (opts?.forbiddenText && i === 1) {
          const body = copy.elements.find((e) => e.type === "text" && e.id.includes("body"));
          if (body && body.type === "text") {
            body.content = `${body.content}\n${opts.forbiddenText}`;
          }
        }
        return copy;
      }
      return {
        ...structuredClone(template),
        id: `slide_${String(i + 1).padStart(2, "0")}`,
        order: i,
        elements: structuredClone(template.elements).map((el) => ({
          ...el,
          id: `${el.id}_s${i + 1}`,
        })),
      };
    });
    base.slides = slides as typeof base.slides;
    if (opts?.aspectRatio) base.metadata.dimensions.aspectRatio = opts.aspectRatio;
    if (opts?.widthUnits != null) base.metadata.dimensions.widthUnits = opts.widthUnits;
    if (opts?.heightUnits != null) base.metadata.dimensions.heightUnits = opts.heightUnits;

    return createArtifact({
      sessionId,
      serviceId: "presentation",
      phaseId: "full-deck",
      organizationId: "org_a",
      projectId: "proj_a",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
      artifactType: "deck",
      data: base as never,
      provenance: {
        contextId: "ctx_m4",
        contextHash: "hash_m4",
        activeBriefId: "brief_m4",
        activeBriefVersion: 1,
        executionId: "exec_m4_deck",
      },
    });
  }

  it("A — exact wording pass/fail", () => {
    const session = startSession();
    const ok = makeDeck(session.sessionId, 3, { headline: "Future of AI" });
    const pass = validateCanonicalArtifact({
      artifactId: ok.artifact.artifactId,
      artifactVersion: ok.version.version,
      sessionId: session.sessionId,
      expectedSessionVersion: session.sessionVersion,
      requirements: [
        req({
          key: "exact_headline",
          displayValue: "Future of AI",
          category: "content",
          value: { kind: "string", value: "Future of AI" },
        }),
      ],
    });
    expect(pass.status).toBe("passed");

    const bad = makeDeck(session.sessionId, 3, { headline: "The Future of AI" });
    const fail = validateCanonicalArtifact({
      artifactId: bad.artifact.artifactId,
      artifactVersion: bad.version.version,
      sessionId: session.sessionId,
      expectedSessionVersion: session.sessionVersion,
      requirements: [
        req({
          key: "exact_headline",
          displayValue: "Future of AI",
          category: "content",
          value: { kind: "string", value: "Future of AI" },
        }),
      ],
    });
    expect(fail.status).toBe("failed");
    expect(fail.blockingIssues[0]?.verificationType).toBe("exact_match");
  });

  it("B — quantity exact / range", () => {
    const session = startSession();
    const deck12 = makeDeck(session.sessionId, 12);
    expect(
      validateCanonicalArtifact({
        artifactId: deck12.artifact.artifactId,
        artifactVersion: deck12.version.version,
        sessionId: session.sessionId,
        expectedSessionVersion: session.sessionVersion,
        requirements: [
          req({
            key: "slide_count",
            displayValue: "12",
            category: "quantity",
            value: { kind: "number", value: 12 },
          }),
        ],
      }).status,
    ).toBe("passed");

    const deck11 = makeDeck(session.sessionId, 11);
    expect(
      validateCanonicalArtifact({
        artifactId: deck11.artifact.artifactId,
        artifactVersion: deck11.version.version,
        sessionId: session.sessionId,
        expectedSessionVersion: session.sessionVersion,
        requirements: [
          req({
            key: "slide_count",
            displayValue: "12",
            category: "quantity",
            value: { kind: "number", value: 12 },
          }),
        ],
      }).status,
    ).toBe("failed");

    const deck13 = makeDeck(session.sessionId, 13);
    expect(
      validateCanonicalArtifact({
        artifactId: deck13.artifact.artifactId,
        artifactVersion: deck13.version.version,
        sessionId: session.sessionId,
        expectedSessionVersion: session.sessionVersion,
        requirements: [
          req({
            key: "slide_count",
            displayValue: "12",
            category: "quantity",
            value: { kind: "number", value: 12 },
          }),
        ],
      }).status,
    ).toBe("failed");

    expect(
      validateCanonicalArtifact({
        artifactId: deck13.artifact.artifactId,
        artifactVersion: deck13.version.version,
        sessionId: session.sessionId,
        expectedSessionVersion: session.sessionVersion,
        requirements: [
          req({
            key: "slide_count",
            displayValue: "10-14",
            category: "quantity",
            value: { kind: "range", value: { min: 10, max: 14 } },
          }),
        ],
      }).status,
    ).toBe("passed");
  });

  it("C — dimensions / aspect ratio", () => {
    const session = startSession();
    const ok = makeDeck(session.sessionId, 3, {
      widthUnits: 16,
      heightUnits: 9,
      aspectRatio: "16:9",
    });
    expect(
      validateCanonicalArtifact({
        artifactId: ok.artifact.artifactId,
        artifactVersion: ok.version.version,
        sessionId: session.sessionId,
        expectedSessionVersion: session.sessionVersion,
        requirements: [
          req({
            key: "aspect_ratio",
            displayValue: "16:9",
            category: "dimension",
            value: { kind: "string", value: "16:9" },
          }),
        ],
      }).status,
    ).toBe("passed");

    const bad = makeDeck(session.sessionId, 3, {
      widthUnits: 9,
      heightUnits: 16,
      aspectRatio: "9:16",
    });
    expect(
      validateCanonicalArtifact({
        artifactId: bad.artifact.artifactId,
        artifactVersion: bad.version.version,
        sessionId: session.sessionId,
        expectedSessionVersion: session.sessionVersion,
        requirements: [
          req({
            key: "aspect_ratio",
            displayValue: "16:9",
            category: "dimension",
            value: { kind: "string", value: "16:9" },
          }),
        ],
      }).status,
    ).toBe("failed");
  });

  it("D/E — required + forbidden content", () => {
    const session = startSession();
    const story = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: "org_a",
      projectId: "proj_a",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: fixturePresentationStoryline() as never,
    });
    expect(
      validateCanonicalArtifact({
        artifactId: story.artifact.artifactId,
        artifactVersion: story.version.version,
        sessionId: session.sessionId,
        expectedSessionVersion: session.sessionVersion,
        requirements: [
          req({
            key: "mandatory_sections",
            displayValue: "problem, solution",
            category: "mandatory_content",
            value: { kind: "string[]", value: ["Problem", "Solution"] },
          }),
        ],
      }).status,
    ).toBe("passed");

    expect(
      validateCanonicalArtifact({
        artifactId: story.artifact.artifactId,
        artifactVersion: story.version.version,
        sessionId: session.sessionId,
        expectedSessionVersion: session.sessionVersion,
        requirements: [
          req({
            key: "mandatory_sections",
            displayValue: "financials",
            category: "mandatory_content",
            value: { kind: "string[]", value: ["Financials"] },
          }),
        ],
      }).status,
    ).toBe("failed");

    const deck = makeDeck(session.sessionId, 3, {
      forbiddenText: "photographs of cats",
    });
    expect(
      validateCanonicalArtifact({
        artifactId: deck.artifact.artifactId,
        artifactVersion: deck.version.version,
        sessionId: session.sessionId,
        expectedSessionVersion: session.sessionVersion,
        requirements: [
          req({
            key: "forbidden.photographs",
            displayValue: "photographs",
            category: "forbidden_content",
            value: { kind: "string", value: "photographs" },
          }),
        ],
      }).status,
    ).toBe("failed");
  });

  it("F — colors on design-system", () => {
    const session = startSession();
    const ds = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "select",
      organizationId: "org_a",
      projectId: "proj_a",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      artifactType: "structured_doc",
      data: fixturePresentationDesignSystem() as never,
    });
    expect(
      validateCanonicalArtifact({
        artifactId: ds.artifact.artifactId,
        artifactVersion: ds.version.version,
        sessionId: session.sessionId,
        expectedSessionVersion: session.sessionVersion,
        requirements: [
          req({
            key: "accent_color",
            displayValue: "#2ECC71",
            category: "color",
            value: { kind: "color", value: "#2ECC71" },
          }),
        ],
        expectedDesignRouteRef: {
          artifactId: "cdfart_fixture_design_route_01",
          version: 1,
        },
      }).status,
    ).toBe("passed");

    expect(
      validateCanonicalArtifact({
        artifactId: ds.artifact.artifactId,
        artifactVersion: ds.version.version,
        sessionId: session.sessionId,
        expectedSessionVersion: session.sessionVersion,
        requirements: [
          req({
            key: "accent_color",
            displayValue: "#FF0000",
            category: "color",
            value: { kind: "color", value: "#FF0000" },
          }),
        ],
      }).status,
    ).toBe("failed");
  });

  it("G — superseded requirement does not fail; override authoritative", () => {
    const session = startSession();
    const deck = makeDeck(session.sessionId, 3, { headline: "Green Path" });
    const result = validateCanonicalArtifact({
      artifactId: deck.artifact.artifactId,
      artifactVersion: deck.version.version,
      sessionId: session.sessionId,
      expectedSessionVersion: session.sessionVersion,
      requirements: [
        req({
          key: "exact_headline",
          displayValue: "Blue Path",
          category: "content",
          value: { kind: "string", value: "Blue Path" },
          status: "superseded",
        }),
        req({
          requirementId: "req_override",
          key: "exact_headline",
          displayValue: "Green Path",
          category: "content",
          value: { kind: "string", value: "Green Path" },
          priority: "explicit_user_override",
          status: "active",
        }),
      ],
    });
    expect(result.status).toBe("passed");
    expect(result.checks).toHaveLength(1);
  });

  it("H — approved dependency exact version", () => {
    const session = startSession();
    const ds = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "select",
      organizationId: "org_a",
      projectId: "proj_a",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      artifactType: "structured_doc",
      data: fixturePresentationDesignSystem() as never,
    });
    const deck = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "full-deck",
      organizationId: "org_a",
      projectId: "proj_a",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
      artifactType: "deck",
      data: fixturePresentationDeck(ds.artifact.artifactId) as never,
    });
    expect(
      validateCanonicalArtifact({
        artifactId: deck.artifact.artifactId,
        artifactVersion: deck.version.version,
        sessionId: session.sessionId,
        expectedSessionVersion: session.sessionVersion,
        requirements: [],
        expectedDesignSystemRef: {
          artifactId: ds.artifact.artifactId,
          version: 1,
        },
      }).status,
    ).toBe("passed");

    expect(
      validateCanonicalArtifact({
        artifactId: deck.artifact.artifactId,
        artifactVersion: deck.version.version,
        sessionId: session.sessionId,
        expectedSessionVersion: session.sessionVersion,
        requirements: [],
        expectedDesignSystemRef: {
          artifactId: ds.artifact.artifactId,
          version: 99,
        },
      }).status,
    ).toBe("failed");
  });

  it("I — stale context rejected", () => {
    const session = startSession();
    const deck = makeDeck(session.sessionId, 3);
    expect(() =>
      validateCanonicalArtifact({
        artifactId: deck.artifact.artifactId,
        artifactVersion: deck.version.version,
        sessionId: session.sessionId,
        expectedSessionVersion: session.sessionVersion - 1,
        requirements: [],
      }),
    ).toThrow(/GENERATION_CONTEXT_STALE/);
  });

  it("J — semantic tone is review_required, not deterministic PASS", () => {
    const session = startSession();
    const deck = makeDeck(session.sessionId, 3);
    const result = validateCanonicalArtifact({
      artifactId: deck.artifact.artifactId,
      artifactVersion: deck.version.version,
      sessionId: session.sessionId,
      expectedSessionVersion: session.sessionVersion,
      requirements: [
        req({
          key: "tone.premium",
          displayValue: "premium",
          category: "tone",
          value: { kind: "string", value: "premium" },
        }),
      ],
    });
    expect(result.status).toBe("review_required");
    expect(result.reviewRequired[0]?.status).toBe("semantic_review_required");
    expect(result.checks[0]?.status).not.toBe("pass");
  });

  it("K — provenance recorded on validation result", () => {
    const session = startSession();
    const deck = makeDeck(session.sessionId, 3);
    const result = validateCanonicalArtifact({
      artifactId: deck.artifact.artifactId,
      artifactVersion: deck.version.version,
      sessionId: session.sessionId,
      expectedSessionVersion: session.sessionVersion,
      contextId: "ctx_k",
      contextHash: "hash_k",
      activeBriefId: session.activeBriefId,
      activeBriefVersion: session.activeBriefVersion,
      requirements: [],
    });
    expect(result.contextId).toBe("ctx_k");
    expect(result.contextHash).toBe("hash_k");
    expect(result.activeBriefId).toBe(session.activeBriefId);
    expect(result.activeBriefVersion).toBe(session.activeBriefVersion);
    expect(result.validatorVersion).toContain("m4");
  });

  it("L — multiple requirements: one blocking fail → FAIL", () => {
    const session = startSession();
    const deck = makeDeck(session.sessionId, 11, { headline: "Future of AI" });
    const result = validateCanonicalArtifact({
      artifactId: deck.artifact.artifactId,
      artifactVersion: deck.version.version,
      sessionId: session.sessionId,
      expectedSessionVersion: session.sessionVersion,
      requirements: [
        req({
          key: "exact_headline",
          displayValue: "Future of AI",
          category: "content",
          value: { kind: "string", value: "Future of AI" },
        }),
        req({
          key: "slide_count",
          displayValue: "12",
          category: "quantity",
          value: { kind: "number", value: 12 },
        }),
      ],
    });
    expect(result.status).toBe("failed");
    expect(result.checks.some((c) => c.status === "pass")).toBe(true);
    expect(result.blockingIssues.some((c) => c.requirementKey === "slide_count")).toBe(
      true,
    );
  });

  it("lifecycle: pass → validated; fail → rejected; no data mutation", () => {
    const session = startSession();
    const deck = makeDeck(session.sessionId, 12);
    const before = structuredClone(
      getArtifactVersion(deck.artifact.artifactId, 1).data,
    );
    const pass = validateCanonicalArtifact({
      artifactId: deck.artifact.artifactId,
      artifactVersion: deck.version.version,
      sessionId: session.sessionId,
      expectedSessionVersion: session.sessionVersion,
      requirements: [
        req({
          key: "slide_count",
          displayValue: "12",
          category: "quantity",
          value: { kind: "number", value: 12 },
        }),
      ],
      applyLifecycle: true,
    });
    expect(pass.status).toBe("passed");
    expect(getArtifactVersion(deck.artifact.artifactId, 1).status).toBe("validated");
    expect(getArtifactVersion(deck.artifact.artifactId, 1).data).toEqual(before);

    const bad = makeDeck(session.sessionId, 5);
    validateCanonicalArtifact({
      artifactId: bad.artifact.artifactId,
      artifactVersion: bad.version.version,
      sessionId: session.sessionId,
      expectedSessionVersion: session.sessionVersion,
      requirements: [
        req({
          key: "slide_count",
          displayValue: "12",
          category: "quantity",
          value: { kind: "number", value: 12 },
        }),
      ],
      applyLifecycle: true,
    });
    expect(getArtifactVersion(bad.artifact.artifactId, 1).status).toBe("rejected");
  });

  it("revalidation appends history; approved remains immutable data", () => {
    const session = startSession();
    const deck = makeDeck(session.sessionId, 12);
    markApproved(deck.artifact.artifactId, 1);
    const v1 = validateCanonicalArtifact({
      artifactId: deck.artifact.artifactId,
      artifactVersion: 1,
      sessionId: session.sessionId,
      expectedSessionVersion: session.sessionVersion,
      requirements: [
        req({
          key: "slide_count",
          displayValue: "12",
          category: "quantity",
          value: { kind: "number", value: 12 },
        }),
      ],
    });
    const v2 = validateCanonicalArtifact({
      artifactId: deck.artifact.artifactId,
      artifactVersion: 1,
      sessionId: session.sessionId,
      expectedSessionVersion: session.sessionVersion,
      requirements: [
        req({
          key: "slide_count",
          displayValue: "10",
          category: "quantity",
          value: { kind: "number", value: 10 },
        }),
      ],
    });
    expect(v1.status).toBe("passed");
    expect(v2.status).toBe("failed");
    expect(listValidationResults(deck.artifact.artifactId, 1)).toHaveLength(2);
  });

  it("does not silently fix bad generation", () => {
    const session = startSession();
    const deck = makeDeck(session.sessionId, 11);
    const result = validateCanonicalArtifact({
      artifactId: deck.artifact.artifactId,
      artifactVersion: deck.version.version,
      sessionId: session.sessionId,
      expectedSessionVersion: session.sessionVersion,
      requirements: [
        req({
          key: "slide_count",
          displayValue: "12",
          category: "quantity",
          value: { kind: "number", value: 12 },
        }),
      ],
    });
    expect(result.status).toBe("failed");
    expect(
      (getArtifactVersion(deck.artifact.artifactId, 1).data.slides as unknown[])
        .length,
    ).toBe(11);
  });
});
