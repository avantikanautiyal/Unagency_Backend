import {
  hostedSitePath,
  siteLinkToken,
  verifySiteLinkToken,
} from "../../../src/platform/media/delivery/hosted-site-links";
import {
  buildPresentationPdf,
  type PresentationPlan,
} from "../../../src/platform/os/delivery/document-export-service";

describe("hosted site links", () => {
  const prev = process.env.SITE_LINK_SECRET;
  beforeAll(() => {
    process.env.SITE_LINK_SECRET = "test-secret";
  });
  afterAll(() => {
    process.env.SITE_LINK_SECRET = prev;
  });

  it("accepts only the token minted for that artifact", () => {
    const token = siteLinkToken("art_webexport_1_0");
    expect(verifySiteLinkToken("art_webexport_1_0", token)).toBe(true);
    expect(verifySiteLinkToken("art_webexport_2_0", token)).toBe(false);
    expect(verifySiteLinkToken("art_webexport_1_0", "nope")).toBe(false);
    expect(verifySiteLinkToken("art_webexport_1_0", undefined)).toBe(false);
  });

  it("builds an API-relative link carrying the token", () => {
    expect(hostedSitePath("art_x_1")).toBe(`/sites/art_x_1?t=${siteLinkToken("art_x_1")}`);
  });
});

describe("presentation export with the brand logo", () => {
  // 2×1 transparent PNG — enough to exercise placement and aspect handling.
  const logo = {
    data:
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=",
    ext: "png",
  };
  const plan: PresentationPlan = {
    title: "Vastra — Banaras in Bloom",
    subtitle: "Pure Banarasi silk suits",
    slides: [
      { title: "Heritage", bullets: ["Woven in Banaras", "Pure silk"], layout: "title_hero" },
      { title: "Why now", bullets: ["Imitations everywhere", "Trust is eroding"], layout: "content_bullets" },
      { title: "Let's weave together", bullets: ["Partner with us"], layout: "closing" },
    ],
  } as PresentationPlan;

  it.each(["minimal", "executive", "editorial"] as const)(
    // (PPTX is not exercised here: pptxgenjs needs --experimental-vm-modules under jest.)
    "renders the PDF in the %s style",
    async (designStyle) => {
      const options = { brandName: "Vastra", brandColors: ["#900c3f"], designStyle, logo };
      const pdf = await buildPresentationPdf(plan, options);
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    },
  );
});
