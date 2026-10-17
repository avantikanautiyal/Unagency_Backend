/**
 * Website imagery: every image the design references becomes a real image,
 * and logo slots become the brand logo — never a broken <img>.
 *
 * Live defect: Complete Website shipped a striped placeholder hero and a
 * broken "primary logo" <img> (model-written file path that never existed).
 */

import {
  resolveWebsiteProjectImages,
  stockPhotoUrlForPrompt,
} from "../../../src/platform/os/delivery/website-image-resolution";
import type { WebProjectPlan } from "../../../src/platform/os/delivery/website-generation";

const html = `<!DOCTYPE html><html><head><style>.hero{background:url(image:hero)}</style></head><body>
<header><img src="assets/logo.png" alt="Chikankari Hues primary logo"></header>
<img src="image:collection" alt="Kurtis">
<img src="images/atelier.jpg" alt="Artisan stitching chikankari">
<img src="https://example.com/ok.jpg" alt="kept">
</body></html>`;

const project = (): WebProjectPlan => ({
  title: "Chikankari Hues",
  summary: "Heritage catalog",
  stack: "html-static" as WebProjectPlan["stack"],
  entry: "index.html",
  files: [{ path: "index.html", content: html }],
});

describe("website image resolution", () => {
  it("generates referenced images, fixes broken local images and logo slots", async () => {
    const prompts: string[] = [];
    const { project: out, report } = await resolveWebsiteProjectImages({
      project: project(),
      specs: [
        { id: "hero", alt: "Hero", prompt: "white chikankari kurta on muslin" },
        { id: "collection", alt: "Kurtis", prompt: "hand-embroidered kurtis on a rail" },
      ],
      brandName: "Chikankari Hues",
      logoDataUrl: "data:image/png;base64,TE9HTw==",
      generate: async (p) => {
        prompts.push(p);
        return { base64: "SU1H", mimeType: "image/png" };
      },
    });
    const content = out.files[0]!.content;
    expect(content).not.toMatch(/image:/);
    expect(content).not.toMatch(/assets\/logo\.png|images\/atelier\.jpg/);
    expect(content).toContain("data:image/png;base64,TE9HTw==");
    expect(content).toContain("url(data:image/png;base64,SU1H)");
    expect(content).toContain("https://example.com/ok.jpg");
    expect(report).toMatchObject({ referenced: 3, generated: 3, external: 0, logoSlots: 1 });
    expect(prompts.some((p) => p.includes("white chikankari kurta"))).toBe(true);
    expect(prompts.some((p) => p.includes("Artisan stitching chikankari"))).toBe(true);
  });

  it("falls back to keyword-matched stock photos when generation fails", async () => {
    const { project: out, report } = await resolveWebsiteProjectImages({
      project: project(),
      specs: [{ id: "hero", alt: "Hero", prompt: "white chikankari kurta on muslin" }],
      brandName: "Chikankari Hues",
      generate: async () => undefined,
    });
    const content = out.files[0]!.content;
    expect(content).not.toMatch(/image:/);
    expect(content).toContain("https://loremflickr.com/1600/1000/");
    expect(report.external).toBe(3);
    // No vault logo: a clean wordmark, not a broken image.
    expect(content).toContain("data:image/svg+xml;base64,");
  });

  it("uploads generated images and links them — never embeds (16 MB record limit)", async () => {
    const uploaded: string[] = [];
    const { project: out } = await resolveWebsiteProjectImages({
      project: project(),
      specs: [{ id: "hero", alt: "Hero", prompt: "white chikankari kurta" }],
      brandName: "Chikankari Hues",
      generate: async () => ({ base64: "SU1H", mimeType: "image/png" }),
      upload: async (_img, id) => {
        uploaded.push(id);
        return `/site-assets/art_${id}?t=x`;
      },
    });
    const content = out.files[0]!.content;
    expect(uploaded.sort()).toEqual(["auto_1", "collection", "hero"]);
    expect(content).toContain("url(/site-assets/art_hero?t=x)");
    expect(content).not.toContain("base64,SU1H");
  });

  it("uses the user's attached photos for product slots before generating", async () => {
    const generatedFor: string[] = [];
    const { project: out, report } = await resolveWebsiteProjectImages({
      project: project(),
      specs: [
        { id: "hero", alt: "Hero", prompt: "white chikankari kurta on muslin" },
        { id: "collection", alt: "Kurtis", prompt: "hand-embroidered kurtis on a rail" },
      ],
      brandName: "Chikankari Hues",
      providedImages: [{ base64: "UFJPRA==", mimeType: "image/jpeg" }],
      generate: async (p) => {
        generatedFor.push(p);
        return { base64: "R0VO", mimeType: "image/png" };
      },
    });
    const content = out.files[0]!.content;
    // Product slot (collection) gets the user's photo; hero is generated.
    expect(content).toContain('src="data:image/jpeg;base64,UFJPRA=="');
    expect(report.provided).toBe(1);
    expect(generatedFor.some((p) => p.includes("hand-embroidered kurtis"))).toBe(false);
    expect(generatedFor.some((p) => p.includes("white chikankari kurta"))).toBe(true);
  });

  it("stock fallback uses the prompt's keywords", () => {
    expect(stockPhotoUrlForPrompt("hand-embroidered kurtis on a rail", "x")).toMatch(
      /^https:\/\/loremflickr\.com\/1600\/1000\/hand%2Cembroidered%2Ckurtis\?lock=\d+$/,
    );
  });
});

import { websiteOutputNeedsDesignRetry } from "../../../src/platform/os/delivery/website-generation";

describe("design retry gate", () => {
  const strong = `<!DOCTYPE html><html><head><style>.a{transition: all .3s}@keyframes f{}</style></head><body><nav></nav><section><h2>A</h2></section><section><h2>B</h2></section><div style="background:url(image:hero)"></div>${"x".repeat(3000)}</body></html>`;

  it("does not re-run a strong single site whose page is in files[]", () => {
    // Live: reading only .html flagged every WebProject build as weak → an
    // extra full model pass (~1.5 min) on every website.
    expect(
      websiteOutputNeedsDesignRetry(
        { title: "S", summary: "", stack: "html-static", entry: "index.html", files: [{ path: "index.html", content: strong }] },
        "html-static",
      ),
    ).toBe(false);
  });

  it("still retries a genuinely thin page", () => {
    expect(
      websiteOutputNeedsDesignRetry(
        { title: "S", summary: "", stack: "html-static", entry: "index.html", files: [{ path: "index.html", content: "<!DOCTYPE html><html><body>hi</body></html>" }] },
        "html-static",
      ),
    ).toBe(true);
  });
});
