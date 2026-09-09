/**
 * CDF stage machine — Social Media happy path + Hybrid handoff.
 */

import {
  applyCdfTransition,
  resetCdfSessionsForTests,
  resolveCdfServiceConfig,
  listCdfServiceIds,
} from "../../../src/platform/cdf";
import {
  setupEnterpriseApi,
  apiRequest,
  loginDemo,
} from "../../../src/platform/api/testing";
import {
  bootstrapEnterpriseApiRuntime,
  resetEnterpriseApiRuntimeForTests,
} from "../../../src/platform/api/runtime";

describe("CDF registry", () => {
  it("lists all 15 service flows", () => {
    expect(listCdfServiceIds()).toHaveLength(15);
    expect(resolveCdfServiceConfig("social-media")?.phases.map((p) => p.id)).toEqual([
      "platform",
      "size-reference",
      "routes",
      "output",
      "final",
    ]);
  });

  it("resolves aliases from SERVICE_OUTPUT_MAP service slugs", () => {
    expect(resolveCdfServiceConfig("social")?.serviceId).toBe("social-media");
    expect(resolveCdfServiceConfig("Social Media")?.serviceId).toBe("social-media");
  });
});

describe("CDF transition service", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
  });

  it("runs Social Media brief → route → approve creative → final", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = started.value.session.sessionId;

    const briefed = applyCdfTransition({
      sessionId,
      action: "submit_brief",
      brief: "Create a mango drink post about everyday energy",
    });
    expect(briefed.ok).toBe(true);
    if (!briefed.ok) return;
    expect(briefed.value.session.phaseId).toBe("platform");
    expect(briefed.value.nextWork).toMatchObject({
      kind: "show_phase",
      phaseId: "platform",
    });
    expect(briefed.value.ui.allowedActions).toContain("select_route");

    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 0 });
    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 1 });

    const selected = applyCdfTransition({
      sessionId,
      action: "select_route",
      routeIndex: 1,
      routeTitle: "Lifestyle Moment",
      routeLabel: "Route 2",
      routeDesc: "Product woven into a relatable scene.",
    });
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    expect(selected.value.session.masters.routeTitle).toBe("Lifestyle Moment");
    expect(selected.value.session.masters.routeDesc).toBe(
      "Product woven into a relatable scene.",
    );
    expect(selected.value.session.phaseId).toBe("output");
    expect(selected.value.nextWork).toMatchObject({
      kind: "generate",
      phaseId: "output",
      generator: "image",
    });

    const refined = applyCdfTransition({
      sessionId,
      action: "refine",
      refinePrompt: "Make the product bigger",
    });
    expect(refined.ok).toBe(true);
    if (!refined.ok) return;
    expect(refined.value.nextWork).toMatchObject({
      kind: "refine",
      phaseId: "output",
    });
    // Refine stays on the same phase
    expect(refined.value.session.phaseId).toBe("output");

    const approved = applyCdfTransition({
      sessionId,
      action: "approve",
      artifactId: "art_social_1",
      executionId: "exec_social_1",
      note: "Hero post: crunch close-up with bold CTA",
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.session.phaseId).toBe("final");
    expect(approved.value.session.masters.masterArtifactId).toBe("art_social_1");
    expect(
      approved.value.session.approved.find((a) => a.phaseId === "output")?.note
    ).toBe("Hero post: crunch close-up with bold CTA");
    expect(approved.value.ui.finalActions).toContain("Download");

    const final = applyCdfTransition({
      sessionId,
      action: "final_action",
      finalAction: "Download",
    });
    expect(final.ok).toBe(true);
    if (!final.ok) return;
    expect(final.value.nextWork).toEqual({
      kind: "materialize_final",
      action: "Download",
    });
  });

  it("shows Send to Studio after first creative approve in hybrid", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "hybrid",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = started.value.session.sessionId;

    applyCdfTransition({
      sessionId,
      action: "submit_brief",
      brief: "Hybrid social brief",
    });
    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 0 }); // platform
    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 0 }); // size-reference
    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 0 }); // routes
    const approved = applyCdfTransition({
      sessionId,
      action: "approve",
      artifactId: "art_1",
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.ui.showSendToStudio).toBe(true);
    expect(approved.value.ui.allowedActions).toContain("handoff_studio");

    const handoff = applyCdfTransition({
      sessionId,
      action: "handoff_studio",
    });
    expect(handoff.ok).toBe(true);
    if (!handoff.ok) return;
    expect(handoff.value.session.modeOwnership).toBe("studio");
    expect(handoff.value.nextWork).toEqual({ kind: "studio_handoff" });

    const blocked = applyCdfTransition({
      sessionId,
      action: "final_action",
      finalAction: "Download",
    });
    expect(blocked.ok).toBe(false);
  });

  it("rejects approve when inherits are missing", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const { getCdfSession, saveCdfSession } = require("../../../src/platform/cdf") as typeof import("../../../src/platform/cdf");
    const session = getCdfSession(started.value.session.sessionId);
    expect(session).toBeTruthy();
    saveCdfSession({
      ...session!,
      brief: "x",
      phaseIndex: 3,
      phaseId: "output",
    });
    const approved = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "approve",
    });
    expect(approved.ok).toBe(false);
  });
});

describe("CDF Wave 2 services", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
  });

  it("resolves web-tech / strategy / ads aliases", () => {
    expect(resolveCdfServiceConfig("website")?.serviceId).toBe("web-tech");
    expect(resolveCdfServiceConfig("Web Tech")?.serviceId).toBe("web-tech");
    expect(resolveCdfServiceConfig("strategy")?.serviceId).toBe("brand-strategy");
    expect(resolveCdfServiceConfig("ads")?.serviceId).toBe("ad-campaigns");
  });

  it("runs Web Tech sitemap → structure → wireframe path", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "web-tech",
      productMode: "ai",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = started.value.session.sessionId;

    const briefed = applyCdfTransition({
      sessionId,
      action: "submit_brief",
      brief: "Build a 5-page premium creative platform site",
    });
    expect(briefed.ok).toBe(true);
    if (!briefed.ok) return;
    expect(briefed.value.session.phaseId).toBe("sitemap");
    expect(briefed.value.nextWork).toMatchObject({
      kind: "generate",
      generator: "structured",
    });

    const sitemap = applyCdfTransition({ sessionId, action: "approve" });
    expect(sitemap.ok).toBe(true);
    if (!sitemap.ok) return;
    expect(sitemap.value.session.phaseId).toBe("page-structure");

    const structure = applyCdfTransition({ sessionId, action: "approve" });
    expect(structure.ok).toBe(true);
    if (!structure.ok) return;
    expect(structure.value.session.phaseId).toBe("wireframe");
  });

  it("runs Brand Strategy territory → platform with hybrid handoff gate", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "brand-strategy",
      productMode: "hybrid",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = started.value.session.sessionId;
    applyCdfTransition({
      sessionId,
      action: "submit_brief",
      brief: "Strategy for CrunchO snacks",
    });
    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 0 });
    const platform = applyCdfTransition({ sessionId, action: "approve" });
    expect(platform.ok).toBe(true);
    if (!platform.ok) return;
    expect(platform.value.session.phaseId).toBe("tone-of-voice");
    expect(platform.value.ui.showSendToStudio).toBe(true);
  });

  it("runs Ad Campaigns strategy → big idea → concept → master KV", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "ad-campaigns",
      productMode: "ai",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = started.value.session.sessionId;
    applyCdfTransition({
      sessionId,
      action: "submit_brief",
      brief: "Launch campaign urban 18-30",
    });
    applyCdfTransition({ sessionId, action: "approve" }); // campaign-strategy
    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 1 });
    const concept = applyCdfTransition({ sessionId, action: "approve" });
    expect(concept.ok).toBe(true);
    if (!concept.ok) return;
    expect(concept.value.session.phaseId).toBe("master-kv");
    expect(concept.value.nextWork).toMatchObject({
      kind: "generate",
      phaseId: "master-kv",
      generator: "image",
    });
  });
});

describe("CDF Wave 3 services", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
  });

  it("resolves logo / print / video / merch / event aliases", () => {
    expect(resolveCdfServiceConfig("branding")?.serviceId).toBe("logo");
    expect(resolveCdfServiceConfig("Print & OOH")?.serviceId).toBe("print-ooh");
    expect(resolveCdfServiceConfig("video")?.serviceId).toBe("videos");
    expect(resolveCdfServiceConfig("pos")?.serviceId).toBe("store-display");
    expect(resolveCdfServiceConfig("photography")?.serviceId).toBe("production");
    expect(resolveCdfServiceConfig("event")?.serviceId).toBe("event-branding");
  });

  it("runs Logo type → territories → options with hybrid handoff gate", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "logo",
      productMode: "hybrid",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = started.value.session.sessionId;
    const briefed = applyCdfTransition({
      sessionId,
      action: "submit_brief",
      brief: "Logo for CrunchO snacks",
    });
    expect(briefed.ok).toBe(true);
    if (!briefed.ok) return;
    expect(briefed.value.session.phaseId).toBe("logo-type");
    expect(briefed.value.session.masters.brandName).toBe("CrunchO");
    expect(briefed.value.nextWork).toMatchObject({
      kind: "show_phase",
      phaseId: "logo-type",
    });
    const afterType = applyCdfTransition({
      sessionId,
      action: "select_route",
      routeIndex: 0,
    });
    expect(afterType.ok).toBe(true);
    if (!afterType.ok) return;
    expect(afterType.value.session.phaseId).toBe("territories");
    expect(afterType.value.nextWork).toMatchObject({
      kind: "generate",
      phaseId: "territories",
      generator: "launch_routes",
    });
    const afterTerritory = applyCdfTransition({
      sessionId,
      action: "select_route",
      routeIndex: 0,
      routeTitle: "Playful Crunch",
      routeLabel: "Territory 1",
    });
    expect(afterTerritory.ok).toBe(true);
    if (!afterTerritory.ok) return;
    expect(afterTerritory.value.session.phaseId).toBe("logo-options");
    const options = applyCdfTransition({ sessionId, action: "approve" });
    expect(options.ok).toBe(true);
    if (!options.ok) return;
    expect(options.value.session.phaseId).toBe("logo-system");
    expect(options.value.ui.showSendToStudio).toBe(true);
  });

  it("runs Packaging dieline → routes → 3d → front → complete pack", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "packaging",
      productMode: "ai",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = started.value.session.sessionId;
    applyCdfTransition({
      sessionId,
      action: "submit_brief",
      brief: "Pack redesign Masala chips",
    });
    // dieline gate
    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 1 });
    // design routes
    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 1 });
    // 3d-direction → front-pack
    applyCdfTransition({ sessionId, action: "approve" });
    // front-pack → complete-pack
    const complete = applyCdfTransition({ sessionId, action: "approve" });
    expect(complete.ok).toBe(true);
    if (!complete.ok) return;
    expect(complete.value.session.phaseId).toBe("complete-pack");
    expect(complete.value.nextWork).toMatchObject({
      kind: "generate",
      phaseId: "complete-pack",
      generator: "image",
    });
  });

  it("runs Videos script path → full script → storyboard", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "videos",
      productMode: "ai",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = started.value.session.sessionId;
    applyCdfTransition({
      sessionId,
      action: "submit_brief",
      brief: "15s product launch film",
    });
    // Script source: create script
    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 1 });
    // Script routes
    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 0 });
    const script = applyCdfTransition({ sessionId, action: "approve" });
    expect(script.ok).toBe(true);
    if (!script.ok) return;
    expect(script.value.session.phaseId).toBe("storyboard");
    expect(script.value.nextWork).toMatchObject({
      kind: "generate",
      phaseId: "storyboard",
      generator: "image",
    });
  });

  it("runs Illustration style → composition → final illustration", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "illustration",
      productMode: "ai",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = started.value.session.sessionId;
    applyCdfTransition({
      sessionId,
      action: "submit_brief",
      brief: "Festive market scene illustration",
    });
    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 1 });
    const composition = applyCdfTransition({ sessionId, action: "approve" });
    expect(composition.ok).toBe(true);
    if (!composition.ok) return;
    expect(composition.value.session.phaseId).toBe("final-illustration");
  });

  it("runs Production master-select → mapping → adaptations", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "production",
      productMode: "ai",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = started.value.session.sessionId;
    applyCdfTransition({
      sessionId,
      action: "submit_brief",
      brief: "Adapt master to 15 digital sizes",
    });
    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 0 }); // master-select
    const adaptations = applyCdfTransition({ sessionId, action: "approve" });
    expect(adaptations.ok).toBe(true);
    if (!adaptations.ok) return;
    expect(adaptations.value.session.phaseId).toBe("adaptations");
    expect(adaptations.value.nextWork).toMatchObject({
      kind: "generate",
      phaseId: "adaptations",
      generator: "image",
    });
  });

  it("runs Event Branding theme → identity with hybrid handoff", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "event-branding",
      productMode: "hybrid",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = started.value.session.sessionId;
    applyCdfTransition({
      sessionId,
      action: "submit_brief",
      brief: "Annual client summit branding",
    });
    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 0 });
    const identity = applyCdfTransition({ sessionId, action: "approve" });
    expect(identity.ok).toBe(true);
    if (!identity.ok) return;
    expect(identity.value.session.phaseId).toBe("select-touchpoints");
    expect(identity.value.ui.showSendToStudio).toBe(true);
  });
});

describe("CDF gateway routes", () => {
  afterEach(() => {
    resetEnterpriseApiRuntimeForTests();
    resetCdfSessionsForTests();
  });

  it("POST /v1/cdf/sessions and /v1/cdf/transition via gateway", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token } = await loginDemo(runtime.platform);
    void setupEnterpriseApi;

    const listRes = await runtime.platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: "/v1/cdf/services",
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(listRes.ok).toBe(true);
    if (!listRes.ok) return;
    expect(listRes.value.status).toBe(200);

    const startRes = await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/cdf/sessions",
        headers: { authorization: `Bearer ${token}` },
        body: { serviceId: "social-media", productMode: "ai" },
      })
    );
    expect(startRes.ok).toBe(true);
    if (!startRes.ok) return;
    const startPayload = startRes.value.body as
      | CdfTransitionResult
      | { data: CdfTransitionResult };
    const started =
      startPayload && typeof startPayload === "object" && "data" in startPayload
        ? startPayload.data
        : (startPayload as CdfTransitionResult);
    const sessionId = started.session?.sessionId;
    expect(typeof sessionId).toBe("string");

    const transitionRes = await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/cdf/transition",
        headers: { authorization: `Bearer ${token}` },
        body: {
          sessionId,
          action: "submit_brief",
          brief: "Gateway social brief",
        },
      })
    );
    expect(transitionRes.ok).toBe(true);
    if (!transitionRes.ok) return;
    expect([200, 201]).toContain(transitionRes.value.status);
  });
});

type CdfTransitionResult = {
  session: { sessionId: string };
};