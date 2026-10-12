/**
 * A delivered email never contains a broken image.
 */

jest.mock("../../../src/config/aws.config", () => ({ __esModule: true, default: { send: jest.fn() } }));

import { resolveEmailImages } from "../../../src/platform/os/delivery/email-image-resolution";

const LOGO = "https://prakriadirect.s3.ap-south-1.amazonaws.com/brand-logos/org/logo.png";

function deps(over: Partial<Parameters<typeof resolveEmailImages>[1]["deps"]> = {}) {
  return {
    publishLogo: jest.fn(async () => LOGO),
    searchImages: jest.fn(async () => ["https://cdn.example/dead.jpg", "https://cdn.example/silk.jpg"]),
    isWorkingImage: jest.fn(async (url: string) => url === "https://cdn.example/silk.jpg" || url === "https://ok.example/real.png"),
    ...over,
  };
}

const HTML = [
  '<img src="logo.png" alt="Vastra" class="brand-logo">',
  '<img src="https://made-up.example/hero.jpg" alt="Hand-woven Banarasi silk suit">',
  '<img src="https://ok.example/real.png" alt="Already real">',
  '<img src="spacer.gif">',
].join("\n");

describe("resolveEmailImages", () => {
  it("uses the permanent brand logo, keeps working images, replaces broken ones, drops the rest", async () => {
    const d = deps();
    const { html, report } = await resolveEmailImages(HTML, { deps: d, context: "Vastra" });
    expect(html).toContain(`src="${LOGO}"`);
    expect(html).toContain('src="https://cdn.example/silk.jpg" alt="Hand-woven Banarasi silk suit"');
    expect(html).toContain('src="https://ok.example/real.png"');
    expect(html).not.toContain("made-up.example");
    expect(html).not.toContain("spacer.gif");
    expect(report).toEqual({ logoReplaced: 1, kept: 1, replaced: 1, removed: 1 });
    // The search is told what the picture is and whose email it is.
    expect(d.searchImages).toHaveBeenCalledWith("Hand-woven Banarasi silk suit — Vastra");
  });

  it("removes an image when no working replacement exists", async () => {
    const d = deps({ searchImages: jest.fn(async () => ["https://cdn.example/dead.jpg"]) });
    const { html, report } = await resolveEmailImages(
      '<p>Hi</p><img src="x.jpg" alt="Product shot">',
      { deps: d },
    );
    expect(html).toBe("<p>Hi</p>");
    expect(report.removed).toBe(1);
  });

  it("never fetches private or non-https addresses", async () => {
    const d = deps({ searchImages: jest.fn(async () => ["http://cdn.example/a.jpg", "https://127.0.0.1/a.jpg"]) });
    await resolveEmailImages('<img src="https://10.0.0.5/secret.png" alt="x">', { deps: d });
    expect(d.isWorkingImage).not.toHaveBeenCalled();
  });

  it("leaves the email untouched when the logo cannot be published and nothing is broken", async () => {
    const d = deps({ publishLogo: jest.fn(async () => undefined) });
    const html = '<img src="https://ok.example/real.png" alt="Brand logo">';
    expect((await resolveEmailImages(html, { deps: d })).html).toBe(html);
  });
});
