/**
 * CDF M9B — Social Media Generation → Canonical Artifact Boundary.
 */

import {
  applyCdfTransition,
  getArtifactVersion,
  ingestGenerationCompletion,
  normalizeToSocialMediaData,
  normalizeSocialMediaPlatform,
  normalizeSocialMediaRoutes,
  normalizeSocialMediaOutput,
  classifySocialMediaProviderOutput,
  resolveArtifactTarget,
  tryIngestSocialMediaCdfCompletion,
  isSocialMediaCanonicalIngestEnabled,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  SOCIAL_MEDIA_FIXTURE_IDS,
  socialMediaSchemaId,
  fixtureSocialMediaPlatform,
  fixtureSocialMediaRoutes,
  fixtureSocialMediaOutput,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  getCdfSession,
  CdfGenerationArtifactError,
  CDF_M3C_GENERATION_PATH_AUDIT,
} from "../../../src/platform/cdf";

describe("CDF M9B Social Media Generation → Artifact Boundary", () => {
  const prevIngest = process.env.CDF_SOCIAL_MEDIA_INGEST;
  const prevForce = process.env.CDF_SOCIAL_MEDIA_FORCE_LEGACY_ONLY;

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    delete process.env.CDF_SOCIAL_MEDIA_INGEST;
    delete process.env.CDF_SOCIAL_MEDIA_FORCE_LEGACY_ONLY;
  });

  afterAll(() => {
    if (prevIngest === undefined) delete process.env.CDF_SOCIAL_MEDIA_INGEST;
    else process.env.CDF_SOCIAL_MEDIA_INGEST = prevIngest;
    if (prevForce === undefined) {
      delete process.env.CDF_SOCIAL_MEDIA_FORCE_LEGACY_ONLY;
    } else {
      process.env.CDF_SOCIAL_MEDIA_FORCE_LEGACY_ONLY = prevForce;
    }
  });

  function startSocialSession() {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
      organizationId: "org_social_m9b",
      projectId: "proj_social_m9b",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Create a post for our new mango drink. Everyday energy.",
      expectedVersion: started.value.session.sessionVersion,
    });
    expect(briefed.ok).toBe(true);
    if (!briefed.ok) throw new Error("brief");
    return briefed.value.session;
  }

  const structuredRoutes = {
    routes: [
      {
        name: "Everyday Energy",
        creativeIdea: "Bright splash",
        visualTreatment: "High-key",
        headlineAngle: "Energy that fits Tuesday",
        rationale: "Matches brief",
      },
      {
        name: "Cold Press Quiet",
        creativeIdea: "Minimal bottle",
        visualTreatment: "Muted",
        headlineAngle: "Quiet strength",
        rationale: "Premium",
      },
      {
        name: "Street Pulse",
        creativeIdea: "City motion",
        visualTreatment: "High contrast",
        headlineAngle: "Move with it",
        rationale: "Youthful",
      },
    ],
  };

  it("TARGET — social-media phases resolve; final has no creative mapping", () => {
    expect(
      resolveArtifactTarget({
        serviceId: "social-media",
        phaseId: "platform",
      }).artifactKey,
    ).toBe(SOCIAL_MEDIA_ARTIFACT_KEYS.platform);
    expect(
      resolveArtifactTarget({
        serviceId: "social-media",
        phaseId: "output",
      }).artifactKey,
    ).toBe(SOCIAL_MEDIA_ARTIFACT_KEYS.output);
    expect(() =>
      resolveArtifactTarget({ serviceId: "social-media", phaseId: "final" }),
    ).toThrow(/final|no Social Media creative/i);
  });

  it("A/B — structured valid routes ×3 → ArtifactVersion", () => {
    const session = startSocialSession();
    const out = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      organizationId: "org_social_m9b",
      projectId: "proj_social_m9b",
      executionId: "exec_social_routes_1",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: structuredRoutes,
      requireAcceptanceGate: true,
    });
    expect(out.artifactKey).toBe(SOCIAL_MEDIA_ARTIFACT_KEYS.routes);
    expect(out.artifactVersion).toBe(1);
    const data = getArtifactVersion(out.artifactId, 1).data as {
      routes: unknown[];
    };
    expect(data.routes).toHaveLength(3);
  });

  it("C — prose-only routes → SOCIAL_CANONICALIZATION_UNSUPPORTED", () => {
    expect(() =>
      normalizeSocialMediaRoutes({ text: "Three ideas about mango..." }),
    ).toThrow(CdfGenerationArtifactError);
    expect(() =>
      normalizeToSocialMediaData(SOCIAL_MEDIA_ARTIFACT_KEYS.routes, {
        text: "prose only",
      }),
    ).toThrow(/SOCIAL_CANONICALIZATION_UNSUPPORTED|prose/i);
    expect(
      classifySocialMediaProviderOutput(SOCIAL_MEDIA_ARTIFACT_KEYS.routes, {
        text: "hello",
      }),
    ).toBe("prose_only");
  });

  it("D — structured output + Vault ObjectId → ArtifactVersion", () => {
    const session = startSocialSession();
    const routes = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      organizationId: "org_social_m9b",
      projectId: "proj_social_m9b",
      executionId: "exec_social_routes_d",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: structuredRoutes,
    });
    const out = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_social_m9b",
      projectId: "proj_social_m9b",
      executionId: "exec_social_output_d",
      expectedSessionVersion: getCdfSession(session.sessionId)!.sessionVersion,
      rawOutput: {
        creativeId: "creative_01",
        compositionNotes: "Product mid-frame",
        previewAssetRef: {
          vaultAssetId: SOCIAL_MEDIA_FIXTURE_IDS.vaultImage,
        },
      },
      socialMediaRefs: {
        routesRef: {
          artifactId: routes.artifactId,
          version: routes.artifactVersion,
        },
      },
      vaultAssetIds: [SOCIAL_MEDIA_FIXTURE_IDS.vaultImage],
    });
    expect(out.artifactKey).toBe(SOCIAL_MEDIA_ARTIFACT_KEYS.output);
    const data = getArtifactVersion(out.artifactId, 1).data as {
      previewAssetRef: { vaultAssetId: string };
      routesRef: { version: number };
    };
    expect(data.previewAssetRef.vaultAssetId).toBe(
      SOCIAL_MEDIA_FIXTURE_IDS.vaultImage,
    );
    expect(data.routesRef.version).toBe(routes.artifactVersion);
  });

  it("E — raster + URL only → unsupported", () => {
    expect(
      classifySocialMediaProviderOutput(SOCIAL_MEDIA_ARTIFACT_KEYS.output, {
        url: "https://cdn.example/x.png",
      }),
    ).toBe("url_only");
    expect(() =>
      normalizeToSocialMediaData(SOCIAL_MEDIA_ARTIFACT_KEYS.output, {
        url: "https://cdn.example/x.png",
      }),
    ).toThrow(/SOCIAL_CANONICALIZATION_UNSUPPORTED/);
  });

  it("F/G/H — art_*/exec_*/URL as vault → rejected", () => {
    expect(() =>
      normalizeSocialMediaOutput(
        {
          creativeId: "creative_01",
          previewAssetRef: { vaultAssetId: "art_legacy_1" },
        },
        {
          routesRef: {
            artifactId: SOCIAL_MEDIA_FIXTURE_IDS.routesArtifactId,
            version: 1,
          },
        },
      ),
    ).toThrow(/art_|Vault|ASSET/i);

    expect(() =>
      normalizeSocialMediaOutput(
        {
          creativeId: "creative_01",
          previewAssetRef: { vaultAssetId: "exec_abc" },
        },
        {
          routesRef: {
            artifactId: SOCIAL_MEDIA_FIXTURE_IDS.routesArtifactId,
            version: 1,
          },
        },
      ),
    ).toThrow(/execution|Vault|ASSET/i);

    expect(() =>
      normalizeSocialMediaOutput(
        {
          creativeId: "creative_01",
          previewAssetRef: { vaultAssetId: "https://cdn.example/x.png" },
        },
        {
          routesRef: {
            artifactId: SOCIAL_MEDIA_FIXTURE_IDS.routesArtifactId,
            version: 1,
          },
        },
      ),
    ).toThrow(/URL|Vault|ASSET/i);
  });

  it("I/J/K — missing routes / bad version / latest → rejected", () => {
    expect(() =>
      normalizeSocialMediaOutput({
        creativeId: "creative_01",
        previewAssetRef: {
          vaultAssetId: SOCIAL_MEDIA_FIXTURE_IDS.vaultImage,
        },
      }),
    ).toThrow(/SOCIAL_UPSTREAM_ARTIFACT_MISSING|routesRef/i);

    expect(() =>
      normalizeSocialMediaOutput(
        {
          creativeId: "creative_01",
          previewAssetRef: {
            vaultAssetId: SOCIAL_MEDIA_FIXTURE_IDS.vaultImage,
          },
        },
        {
          routesRef: {
            artifactId: SOCIAL_MEDIA_FIXTURE_IDS.routesArtifactId,
            version: 0,
          },
        },
      ),
    ).toThrow(/SOCIAL_UPSTREAM_VERSION_MISSING|version/i);

    expect(() =>
      normalizeToSocialMediaData(
        SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        {
          schemaId: socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.output),
          creativeId: "creative_01",
          routesRef: {
            artifactId: SOCIAL_MEDIA_FIXTURE_IDS.routesArtifactId,
            version: "latest",
          },
          previewAssetRef: {
            vaultAssetId: SOCIAL_MEDIA_FIXTURE_IDS.vaultImage,
          },
        },
        {
          routesRef: {
            artifactId: SOCIAL_MEDIA_FIXTURE_IDS.routesArtifactId,
            version: 1,
          },
        },
      ),
    ).not.toThrow(); // opts override; schema path returns as-is — validate later

    // Direct latest in routesRef via opts
    expect(() =>
      normalizeSocialMediaOutput(
        {
          creativeId: "creative_01",
          previewAssetRef: {
            vaultAssetId: SOCIAL_MEDIA_FIXTURE_IDS.vaultImage,
          },
        },
        {
          routesRef: {
            artifactId: SOCIAL_MEDIA_FIXTURE_IDS.routesArtifactId,
            // @ts-expect-error intentional
            version: "latest",
          },
        },
      ),
    ).toThrow(/version|SOCIAL_UPSTREAM/i);
  });

  it("L — stale session → rejected", () => {
    const session = startSocialSession();
    expect(() =>
      ingestGenerationCompletion({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "platform",
        organizationId: "org_social_m9b",
        projectId: "proj_social_m9b",
        executionId: "exec_stale",
        expectedSessionVersion: session.sessionVersion - 1,
        rawOutput: { platform: "instagram", label: "Instagram" },
      }),
    ).toThrow(/STALE|stale/i);
  });

  it("N/O/Q — idempotent replay + conflict + stable ids", () => {
    const session = startSocialSession();
    const a = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      organizationId: "org_social_m9b",
      projectId: "proj_social_m9b",
      executionId: "exec_idem_routes",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: structuredRoutes,
      requestId: "m9b_idem_routes_1",
    });
    const b = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      organizationId: "org_social_m9b",
      projectId: "proj_social_m9b",
      executionId: "exec_idem_routes",
      expectedSessionVersion: getCdfSession(session.sessionId)!.sessionVersion,
      rawOutput: structuredRoutes,
      requestId: "m9b_idem_routes_1",
    });
    expect(b.idempotentReplay).toBe(true);
    expect(b.artifactId).toBe(a.artifactId);
    expect(b.artifactVersion).toBe(a.artifactVersion);

    const dataA = getArtifactVersion(a.artifactId, 1).data as {
      routes: Array<{ routeId: string }>;
    };
    const dataB = getArtifactVersion(b.artifactId, 1).data as {
      routes: Array<{ routeId: string }>;
    };
    expect(dataA.routes.map((r) => r.routeId)).toEqual(
      dataB.routes.map((r) => r.routeId),
    );

    expect(() =>
      ingestGenerationCompletion({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "routes",
        organizationId: "org_social_m9b",
        projectId: "proj_social_m9b",
        executionId: "exec_idem_routes",
        expectedSessionVersion: getCdfSession(session.sessionId)!.sessionVersion,
        rawOutput: {
          routes: [
            { name: "Changed A", creativeIdea: "x" },
            { name: "Changed B", creativeIdea: "y" },
            { name: "Changed C", creativeIdea: "z" },
          ],
        },
        requestId: "m9b_idem_routes_1",
      }),
    ).toThrow(/IDEMPOTENCY_CONFLICT/);
  });

  it("P — wrong cardinality (not exactly 3) → rejected", () => {
    expect(() =>
      normalizeSocialMediaRoutes({
        routes: [{ name: "Only one" }],
      }),
    ).toThrow(/exactly 3|cardinality/i);
  });

  it("R — CDF_SOCIAL_MEDIA_INGEST=OFF → opt_in_disabled", () => {
    expect(isSocialMediaCanonicalIngestEnabled()).toBe(false);
    const session = startSocialSession();
    const r = tryIngestSocialMediaCdfCompletion({
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "social-media",
        cdfPhaseId: "platform",
      },
      rawOutput: { platform: "instagram", label: "Instagram" },
      executionId: "exec_off",
    });
    expect(r?.kind).toBe("opt_in_disabled");
    if (r && "legacyCompatible" in r) {
      expect(r.legacyCompatible).toBe(true);
    }
  });

  it("S — INGEST=ON + eligible platform → accepted attach", () => {
    process.env.CDF_SOCIAL_MEDIA_INGEST = "1";
    const session = startSocialSession();
    const r = tryIngestSocialMediaCdfCompletion({
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "social-media",
        cdfPhaseId: "platform",
      },
      rawOutput: { platform: "instagram", label: "Instagram" },
      executionId: "exec_on_platform",
      organizationId: "org_social_m9b",
      projectId: "proj_social_m9b",
    });
    expect(r?.kind).toBe("accepted");
    if (r?.kind === "accepted") {
      expect(r.attach.cdfRuntimePath).toBe("canonical");
      expect(r.attach.cdfArtifactKey).toBe(SOCIAL_MEDIA_ARTIFACT_KEYS.platform);
      expect(r.attach.canonicalPath).toBe(true);
    }
  });

  it("T — INGEST=ON + unsupported output → canonicalization_unsupported + legacyCompatible", () => {
    process.env.CDF_SOCIAL_MEDIA_INGEST = "1";
    const session = startSocialSession();
    const r = tryIngestSocialMediaCdfCompletion({
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "social-media",
        cdfPhaseId: "output",
      },
      rawOutput: {
        kind: "artifact",
        data: { artifactIds: ["art_social_1"] },
      },
      executionId: "exec_on_bad_output",
      organizationId: "org_social_m9b",
      projectId: "proj_social_m9b",
    });
    expect(r?.kind).toBe("canonicalization_unsupported");
    if (r && "legacyCompatible" in r) {
      expect(r.legacyCompatible).toBe(true);
    }
  });

  it("U/V — platform + size from actual configuration only", () => {
    expect(normalizeSocialMediaPlatform({ label: "Instagram" }).platform).toBe(
      "instagram",
    );
    expect(() =>
      normalizeSocialMediaPlatform({ label: "TikTok" }),
    ).toThrow(/SOCIAL_STRUCTURED_DATA_MISSING|platform/i);

    const size = normalizeToSocialMediaData(
      SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      {
        label: "Enter Size",
        widthPx: 1080,
        heightPx: 1080,
      },
    ) as { pathKind: string; canvas: { widthPx: number } };
    expect(size.pathKind).toBe("enter_size");
    expect(size.canvas.widthPx).toBe(1080);

    expect(() =>
      normalizeToSocialMediaData(SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference, {
        label: "Enter Size",
      }),
    ).toThrow(/widthPx|canvas|SOCIAL_STRUCTURED/i);
  });

  it("final phase → final_no_artifact", () => {
    const session = startSocialSession();
    const r = tryIngestSocialMediaCdfCompletion({
      forceOptIn: true,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "social-media",
        cdfPhaseId: "final",
      },
      rawOutput: fixtureSocialMediaOutput(),
      executionId: "exec_final",
    });
    expect(r?.kind).toBe("final_no_artifact");
  });

  it("path-audit classifies Social Media paths (not out_of_scope)", () => {
    const social = CDF_M3C_GENERATION_PATH_AUDIT.filter((r) =>
      r.path.startsWith("Social Media"),
    );
    expect(social.length).toBeGreaterThanOrEqual(5);
    const byPath = Object.fromEntries(social.map((r) => [r.path, r.status]));
    expect(byPath["Social Media platform"]).toBe("canonical-capable");
    expect(byPath["Social Media size-reference"]).toBe("canonical-capable");
    expect(byPath["Social Media routes"]).toBe(
      "canonicalization-unsupported",
    );
    expect(byPath["Social Media output"]).toBe(
      "canonicalization-unsupported",
    );
    expect(byPath["Social Media final"]).toBe("non-artifact");
    expect(social.every((r) => r.status !== "out_of_scope")).toBe(true);
  });

  it("HARDENING — M9B does not mutate session generated/selected/approved refs", () => {
    process.env.CDF_SOCIAL_MEDIA_INGEST = "1";
    const session = startSocialSession();
    const before = getCdfSession(session.sessionId)!;
    const genBefore = [...(before.generatedArtifacts ?? [])];
    const selBefore = [...(before.selectedArtifacts ?? [])];
    const apprBefore = [...(before.approvedArtifacts ?? [])];

    const r = tryIngestSocialMediaCdfCompletion({
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "social-media",
        cdfPhaseId: "platform",
      },
      rawOutput: { platform: "instagram", label: "Instagram" },
      executionId: "exec_no_session_mut",
      organizationId: "org_social_m9b",
      projectId: "proj_social_m9b",
    });
    expect(r?.kind).toBe("accepted");
    if (r?.kind !== "accepted") throw new Error("expected accepted");

    // Return identity is provenance — not a session mutation
    expect(r.attach.cdfArtifactId.startsWith("cdfart_")).toBe(true);
    expect(Number.isInteger(r.attach.cdfArtifactVersion)).toBe(true);
    expect(r.attach.cdfArtifactVersion).toBeGreaterThanOrEqual(1);

    const after = getCdfSession(session.sessionId)!;
    expect(after.generatedArtifacts ?? []).toEqual(genBefore);
    expect(after.selectedArtifacts ?? []).toEqual(selBefore);
    expect(after.approvedArtifacts ?? []).toEqual(apprBefore);

    // No auto-select / auto-approve of the new artifact
    const artId = r.attach.cdfArtifactId;
    expect(
      (after.selectedArtifacts ?? []).some((x) => x.artifactId === artId),
    ).toBe(false);
    expect(
      (after.approvedArtifacts ?? []).some((x) => x.artifactId === artId),
    ).toBe(false);
    expect(
      (after.generatedArtifacts ?? []).some((x) => x.artifactId === artId),
    ).toBe(false);
  });

  it("HARDENING — exact artifactId@version; never latest/HEAD as dependency", () => {
    const session = startSocialSession();
    const routes = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      organizationId: "org_social_m9b",
      projectId: "proj_social_m9b",
      executionId: "exec_exact_ver",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: structuredRoutes,
    });
    expect(routes.artifactId.startsWith("cdfart_")).toBe(true);
    expect(routes.artifactVersion).toBe(1);

    const out = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_social_m9b",
      projectId: "proj_social_m9b",
      executionId: "exec_exact_out",
      expectedSessionVersion: getCdfSession(session.sessionId)!.sessionVersion,
      rawOutput: {
        creativeId: "creative_01",
        compositionNotes: "exact pin",
        previewAssetRef: {
          vaultAssetId: SOCIAL_MEDIA_FIXTURE_IDS.vaultImage,
        },
      },
      socialMediaRefs: {
        routesRef: {
          artifactId: routes.artifactId,
          version: routes.artifactVersion,
        },
      },
      vaultAssetIds: [SOCIAL_MEDIA_FIXTURE_IDS.vaultImage],
    });
    const data = getArtifactVersion(out.artifactId, out.artifactVersion).data as {
      routesRef: { artifactId: string; version: number | string };
    };
    expect(data.routesRef.artifactId).toBe(routes.artifactId);
    expect(data.routesRef.version).toBe(routes.artifactVersion);
    expect(data.routesRef.version).not.toBe("latest");
    expect(data.routesRef.version).not.toBe("HEAD");
  });

  it("fixtures still validate via normalize passthrough", () => {
    const p = normalizeSocialMediaPlatform(fixtureSocialMediaPlatform());
    expect(p.platformId).toBe("platform_instagram");
    const r = normalizeSocialMediaRoutes(fixtureSocialMediaRoutes());
    expect(r.routes).toHaveLength(3);
  });
});
