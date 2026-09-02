/**
 * learnFromBrief — regex + optional LLM enrichment wiring.
 */

import { enrichBrandPreferencesFromBrief } from "../../../src/services/brand-brief-llm-extractor";

jest.mock("../../../src/services/brand-brief-llm-extractor", () => ({
  enrichBrandPreferencesFromBrief: jest.fn(),
}));

jest.mock("../../../src/services/brand-service", () => ({
  brandService: {
    get: jest.fn(async () => ({
      organizationId: "507f1f77bcf86cd799439011",
      name: "Test Brand",
    })),
  },
}));

jest.mock("../../../src/services/brand-preference-writer", () => ({
  mergePreferencesIntoProductBrand: jest.fn(async (input: {
    preferences: { colors?: string[] };
  }) => ({
    updated: true,
    brandId: "507f1f77bcf86cd799439012",
    reason: "merged",
    preferences: input.preferences,
  })),
}));

jest.mock("../../../src/platform/api/runtime/bootstrap-enterprise-api", () => ({
  getEnterpriseApiRuntime: jest.fn(() => undefined),
}));

import { learnBrandKnowledgeFromBrief } from "../../../src/services/brand-learn-from-brief";
import { getEnterpriseApiRuntime } from "../../../src/platform/api/runtime/bootstrap-enterprise-api";
import { mergePreferencesIntoProductBrand } from "../../../src/services/brand-preference-writer";

const enrichMock = enrichBrandPreferencesFromBrief as jest.MockedFunction<
  typeof enrichBrandPreferencesFromBrief
>;
const runtimeMock = getEnterpriseApiRuntime as jest.MockedFunction<
  typeof getEnterpriseApiRuntime
>;

describe("learnBrandKnowledgeFromBrief LLM wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runtimeMock.mockReturnValue(undefined);
  });

  it("uses regex path when no integration engine is available", async () => {
    const result = await learnBrandKnowledgeFromBrief({
      userId: "user_1",
      brandId: "507f1f77bcf86cd799439012",
      organizationId: "507f1f77bcf86cd799439011",
      prompt: "Instagram post — rang laal aur neela",
      source: "chat_learn",
    });

    expect(enrichMock).not.toHaveBeenCalled();
    expect(result.updated).toBe(true);
    expect(result.extractionSource).toBe("regex");
    expect(result.extracted?.colors).toEqual(
      expect.arrayContaining(["red", "blue"])
    );
    expect(mergePreferencesIntoProductBrand).toHaveBeenCalled();
  });

  it("uses enrichBrandPreferencesFromBrief when integration is passed", async () => {
    enrichMock.mockResolvedValue({
      colors: ["maroon", "gold"],
      extractionSource: "llm",
    });

    const fakeIntegration = { run: jest.fn() } as never;
    const result = await learnBrandKnowledgeFromBrief({
      userId: "user_1",
      brandId: "507f1f77bcf86cd799439012",
      organizationId: "507f1f77bcf86cd799439011",
      prompt: "Usa colores granate y dorado",
      integration: fakeIntegration,
    });

    expect(enrichMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("granate"),
        organizationId: "507f1f77bcf86cd799439011",
        integration: fakeIntegration,
      })
    );
    expect(result.extractionSource).toBe("llm");
    expect(result.extracted?.colors).toEqual(
      expect.arrayContaining(["maroon", "gold"])
    );
  });

  it("resolves integration from enterprise runtime when not passed", async () => {
    const fakeIntegration = { run: jest.fn() } as never;
    runtimeMock.mockReturnValue({
      platform: { integrationEngine: fakeIntegration },
    } as never);
    enrichMock.mockResolvedValue({
      colors: ["green"],
      extractionSource: "regex+llm",
    });

    const result = await learnBrandKnowledgeFromBrief({
      userId: "user_1",
      brandId: "507f1f77bcf86cd799439012",
      organizationId: "507f1f77bcf86cd799439011",
      prompts: ["Brand rang hara rakho"],
    });

    expect(enrichMock).toHaveBeenCalled();
    expect(result.extractionSource).toBe("regex+llm");
  });
});
