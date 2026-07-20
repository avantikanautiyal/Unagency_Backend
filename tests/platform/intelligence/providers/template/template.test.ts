import {
  sampleTemplateRequest,
  setupTemplatePlatform,
  SKELETON_PROVIDER_ID,
} from "../../../../../src/platform/intelligence/providers/template/testing";

describe("Universal Provider Template", () => {
  it("bootstraps through standard lifecycle phases", async () => {
    const { engine } = setupTemplatePlatform();
    const lifecycle = await engine.bootstrap();

    expect(lifecycle.ok).toBe(true);
    if (!lifecycle.ok) return;
    expect(lifecycle.value.ready).toBe(true);
    expect(lifecycle.value.currentPhase).toBe("ready");
    expect(lifecycle.value.history.map((h) => h.phase)).toContain("loading_models");
  });

  it("exposes feature matrix", () => {
    const { engine } = setupTemplatePlatform();
    const matrix = engine.getFeatureMatrix();

    expect(matrix.ok).toBe(true);
    if (!matrix.ok) return;
    expect(matrix.value.features.length).toBeGreaterThan(10);
  });

  it("registers skeleton provider factory", () => {
    const { registry } = setupTemplatePlatform();
    const factory = registry.resolve(SKELETON_PROVIDER_ID);

    expect(factory.ok).toBe(true);
    if (!factory.ok) return;
    const components = factory.value.create();
    expect(components.ok).toBe(true);
  });

  it("maps request through skeleton adapter without networking", async () => {
    const { registry } = setupTemplatePlatform();
    const factory = registry.resolve(SKELETON_PROVIDER_ID);
    expect(factory.ok).toBe(true);
    if (!factory.ok) return;

    const components = factory.value.create();
    expect(components.ok).toBe(true);
    if (!components.ok) return;

    const request = sampleTemplateRequest();
    const response = await components.value.adapter.translate(request);

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.value.output).toBeDefined();
  });
});
