import {
  resolveImageUseCaseFromService,
  resolveMatrixUsedIn,
  resolveTextUseCaseFromService,
  resolveVideoUseCaseFromService,
} from "../../../src/platform/providers/routing/matrix/service-matrix-routing";
import {
  resolveImageCreativeUseCaseFromContext,
  resolveTextCreativeUseCaseFromMetadata,
  resolveVideoCreativeUseCase,
} from "../../../src/platform/providers/routing/matrix/matrix-use-case-routing";

describe("service-matrix-routing", () => {
  it("maps Web Tech subtypes to Used In buckets", () => {
    expect(
      resolveMatrixUsedIn({ service: "website", subtype: "landing-page" })
    ).toBe("coding");
    expect(
      resolveMatrixUsedIn({ service: "website", subtype: "visual-asset" })
    ).toBe("landing_pages");
    expect(resolveMatrixUsedIn({ service: "social", subtype: "strategy" })).toBe(
      "campaigns"
    );
  });

  it("maps branding logo to logo image use case", () => {
    expect(
      resolveImageUseCaseFromService({
        service: "branding",
        subtype: "logo-design",
      })
    ).toBe("logo");
  });

  it("maps print posters to typography", () => {
    expect(
      resolveImageUseCaseFromService({ service: "print", subtype: "posters" })
    ).toBe("typography");
  });

  it("maps packaging to product visualization", () => {
    expect(
      resolveImageUseCaseFromService({ service: "packaging", subtype: "boxes" })
    ).toBe("product");
  });

  it("maps video promo to commercial_ad", () => {
    expect(
      resolveVideoUseCaseFromService({
        service: "video",
        subtype: "promo-videos",
      })
    ).toBe("commercial_ad");
  });

  it("maps social copywriting to copy text use case", () => {
    expect(
      resolveTextUseCaseFromService({
        service: "social",
        subtype: "copywriting",
      })
    ).toBe("copy");
  });

  it("maps website landing page to website text use case", () => {
    expect(
      resolveTextUseCaseFromService({
        service: "website",
        subtype: "landing-page",
      })
    ).toBe("website");
  });
});

describe("matrix use-case resolution with service context", () => {
  it("prefers service mapping over prompt heuristics for print posters", () => {
    expect(
      resolveImageCreativeUseCaseFromContext("make something nice", {
        service: "print",
        subtype: "posters",
      })
    ).toBe("typography");
  });

  it("routes presentations metadata to strategy LLMs", () => {
    expect(
      resolveTextCreativeUseCaseFromMetadata("build a deck", {
        service: "presentations",
        subtype: "pitch-decks",
        outputKind: "presentation",
      })
    ).toBe("strategy");
  });

  it("defaults video service to marketing use case", () => {
    expect(
      resolveVideoCreativeUseCase("create a clip", {
        service: "video",
        subtype: "explainer-videos",
      })
    ).toBe("marketing");
  });
});
