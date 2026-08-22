import { createContextIntelligenceEngine } from "../../../../src/platform/intelligence/context/factories/create-context-engine";
import { sampleContextBuildRequest } from "../../../../src/platform/intelligence/context/testing";
import { ContextNormalizer } from "../../../../src/platform/intelligence/context/normalization/context-normalizer";
import { ContextValidator } from "../../../../src/platform/intelligence/context/validation/context-validator";
import {
  PlaceholderOrganizationResolver,
  PlaceholderWorkspaceResolver,
} from "../../../../src/platform/intelligence/context/resolvers/placeholder-resolvers";
import { createDefaultEnrichmentPipeline } from "../../../../src/platform/intelligence/context/enrichment/enrichment-pipeline";

describe("ContextIntelligenceEngine", () => {
  it("builds a complete intelligence context", async () => {
    const engine = createContextIntelligenceEngine();
    const result = await engine.build(sampleContextBuildRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.identity.organizationId).toBe("org_1");
    expect(result.value.scope.capabilityId).toBe("echo");
    expect(result.value.organization.name).toBe("Unagency");
    expect(result.value.brand.brandId).toBe("brand_1");
    expect(result.value.brand.name).toBe("Acme Studio");
    expect(result.value.brand.colors).toBe("#111111, #F5F5F5");
    expect(result.value.assets.assetIds).toContain("asset_1");
    expect(result.value.role.roles).toContain("member");
    expect(result.value.language.language).toBe("en");
    expect(result.value.locale.locale).toBe("en-US");
    expect(result.value.platform.platformName).toContain("UNAGENCY");
  });

  it("propagates identity into scope", async () => {
    const engine = createContextIntelligenceEngine();
    const result = await engine.build(
      sampleContextBuildRequest({
        organizationId: "org_x",
        workspaceId: "ws_x",
        userId: "user_x",
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.identity.userId).toBe("user_x");
    expect(String(result.value.scope.organizationId)).toBe("org_x");
    expect(String(result.value.scope.workspaceId)).toBe("ws_x");
  });

  it("creates immutable snapshots", async () => {
    const engine = createContextIntelligenceEngine();
    const snapshot = await engine.snapshot(sampleContextBuildRequest());

    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    expect(snapshot.value.snapshotId).toMatch(/^snap_/);
    expect(snapshot.value.checksum).toBeTruthy();
    expect(snapshot.value.context.metadata.contextId).toBeTruthy();
  });
});

describe("ContextNormalizer", () => {
  it("normalizes language, locale, and currency", async () => {
    const engine = createContextIntelligenceEngine();
    const built = await engine.build(
      sampleContextBuildRequest({ language: "EN", locale: "en_us" })
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const normalizer = new ContextNormalizer();
    const normalized = normalizer.normalize(built.value);
    expect(normalized.language.language).toBe("en");
    expect(normalized.locale.locale).toBe("en-US");
    expect(normalized.locale.currency).toBe("USD");
  });
});

describe("ContextValidator", () => {
  it("accepts a valid context", async () => {
    const engine = createContextIntelligenceEngine();
    const built = await engine.build(sampleContextBuildRequest());
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const validated = new ContextValidator().validate(built.value);
    expect(validated.ok).toBe(true);
  });

  it("rejects identity/scope mismatch", async () => {
    const engine = createContextIntelligenceEngine();
    const built = await engine.build(sampleContextBuildRequest());
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const invalid = {
      ...built.value,
      scope: {
        ...built.value.scope,
        organizationId: "other" as never,
      },
    };

    const validated = new ContextValidator().validate(invalid);
    expect(validated.ok).toBe(false);
  });
});

describe("Context enrichment and resolvers", () => {
  it("runs enrichment pipeline", async () => {
    const pipeline = createDefaultEnrichmentPipeline();
    const result = await pipeline.enrich(sampleContextBuildRequest(), {});
    expect(result.ok).toBe(true);
  });

  it("resolves organization and workspace availability", async () => {
    const org = await new PlaceholderOrganizationResolver().resolve(
      sampleContextBuildRequest()
    );
    const ws = await new PlaceholderWorkspaceResolver().resolve(
      sampleContextBuildRequest()
    );
    expect(org.ok && org.value.available).toBe(true);
    expect(ws.ok && ws.value.available).toBe(true);
  });
});
