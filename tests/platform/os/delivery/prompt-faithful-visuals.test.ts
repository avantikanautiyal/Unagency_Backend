/**
 * Prompt-faithful visuals — PPTX image embed, website motion/colors, prompt relax.
 */

import {
  buildPresentationPdf,
  type PresentationPlan,
} from "../../../../src/platform/os/delivery/document-export-service";
import { resolvePresentationExportOptions } from "../../../../src/platform/api/services/document-export-materializer";
import {
  expandWebProjectFill,
  stampHeroImageOntoWebProject,
  type WebProjectFill,
} from "../../../../src/platform/os/delivery/website-project-templates";
import { buildWebProjectInstructionBlock } from "../../../../src/platform/os/delivery/website-generation";

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const samplePlan: PresentationPlan = {
  title: "Acme Pitch",
  subtitle: "Series A",
  slides: [
    {
      title: "Problem",
      bullets: ["Teams waste time", "Tools are fragmented"],
      notes: "Open with pain",
      layout: "content_bullets",
      visualCue: "Busy office desks with tangled cables, cool blue light",
    },
    {
      title: "Solution",
      bullets: ["One workspace"],
      notes: "",
      layout: "key_message",
      visualCue: "Clean product UI mock on a dark gradient",
    },
  ],
};

describe("prompt-faithful presentation visuals", () => {
  it("invokes resolveSlideImage for each visualCue and still builds PDF with images", async () => {
    const calls: string[] = [];
    const pdf = await buildPresentationPdf(samplePlan, {
      brandName: "Acme",
      brandColors: ["#1E3A8A", "#0B0B0F"],
      resolveSlideImage: async (cue) => {
        calls.push(cue);
        return { data: tinyPngBase64, ext: "png" };
      },
    });
    expect(calls).toHaveLength(2);
    expect(pdf.slice(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(800);
  });

  it("still exports PDF when resolveSlideImage returns undefined or throws", async () => {
    const ok = await buildPresentationPdf(samplePlan, {
      resolveSlideImage: async () => undefined,
    });
    expect(ok.slice(0, 4).toString()).toBe("%PDF");

    const ok2 = await buildPresentationPdf(samplePlan, {
      resolveSlideImage: async () => {
        throw new Error("provider down");
      },
    });
    expect(ok2.slice(0, 4).toString()).toBe("%PDF");
  });

  it("PDF export tolerates missing images", async () => {
    const pdf = await buildPresentationPdf(samplePlan, {
      brandColors: ["#C41E3A"],
      resolveSlideImage: async () => undefined,
    });
    expect(pdf.slice(0, 4).toString()).toBe("%PDF");
  });

  it("resolvePresentationExportOptions pulls brief colours first", () => {
    const opts = resolvePresentationExportOptions({
      userBrief: "Make a pitch deck in navy blue and gold for Nova Labs",
      brandName: "Nova Labs",
    });
    expect(opts.brandName).toMatch(/Nova/i);
    expect(opts.brandColors?.length).toBeGreaterThan(0);
    expect(
      opts.brandColors?.some((c) =>
        /1e3a8a|d4af37|0a1628/i.test(c.replace("#", ""))
      )
    ).toBe(true);
  });
});

describe("prompt-faithful website visuals", () => {
  const fill: WebProjectFill = {
    title: "Nova",
    summary: "Launch site",
    stack: "react-vite",
    brandName: "Nova",
    tagline: "Ship faster",
    heroBody: "Creative OS for brands",
    sections: [
      { heading: "Speed", body: "Minutes not weeks" },
      { heading: "Craft", body: "On-brief every time" },
    ],
    ctaLabel: "Start",
    colors: {
      primary: "#1E3A8A",
      background: "#0B0D10",
      text: "#F4F6F8",
      accent: "#D4AF37",
    },
    html: "",
  };

  it("scaffold CSS includes motion and brand colours", () => {
    const project = expandWebProjectFill(fill);
    const css = project.files.find((f) => f.path.endsWith("index.css"))?.content ?? "";
    expect(css).toMatch(/@keyframes/);
    expect(css).toMatch(/transition:/);
    expect(css).toContain("#1E3A8A");
    expect(css).toContain("#D4AF37");
    expect(css).toMatch(/radial-gradient/);
  });

  it("scaffolds include public HTTPS stock image URLs", () => {
    const react = expandWebProjectFill(fill);
    const app = react.files.find((f) => f.path.endsWith("App.tsx"))?.content ?? "";
    expect(app).toMatch(/https:\/\/picsum\.photos\/seed\//);
    expect(app).toMatch(/heroImage|hero-media|card-media|hero-product|hero-editorial|hero-bento/);

    const htmlProject = expandWebProjectFill({
      ...fill,
      stack: "html-static",
      html: "",
    });
    const html =
      htmlProject.files.find((f) => f.path.endsWith("index.html"))?.content ?? "";
    expect(html).toMatch(/<img[^>]+src="https:\/\/picsum\.photos\/seed\//i);
    expect(html).toMatch(/sticky|hero-frame|proof/i);

    const next = expandWebProjectFill({ ...fill, stack: "next" });
    const page = next.files.find((f) => f.path.endsWith("page.tsx"))?.content ?? "";
    expect(page).toMatch(/https:\/\/picsum\.photos\/seed\//);
  });

  it("multi-route layout indexes produce distinct React scaffolds", () => {
    const a = expandWebProjectFill({ ...fill, layoutRouteIndex: 0 });
    const b = expandWebProjectFill({ ...fill, layoutRouteIndex: 1 });
    const c = expandWebProjectFill({ ...fill, layoutRouteIndex: 2 });
    const appA = a.files.find((f) => f.path.endsWith("App.tsx"))?.content ?? "";
    const appB = b.files.find((f) => f.path.endsWith("App.tsx"))?.content ?? "";
    const appC = c.files.find((f) => f.path.endsWith("App.tsx"))?.content ?? "";
    // bold-hero / editorial / product-grid class markers
    expect(appA).toMatch(/hero-copy|className=\"hero\"/);
    expect(appB).toMatch(/hero-editorial/);
    expect(appC).toMatch(/hero-product|product-grid/);
  });

  it("stamps hero image into html-static project", () => {
    const htmlProject = expandWebProjectFill({
      ...fill,
      stack: "html-static",
      html: "",
    });
    const stamped = stampHeroImageOntoWebProject(
      htmlProject,
      `data:image/png;base64,${tinyPngBase64}`
    );
    const html =
      stamped.files.find((f) => f.path.endsWith("index.html"))?.content ?? "";
    expect(html).toMatch(/<img[^>]+hero-visual/i);
    expect(html).toMatch(/@keyframes/);
  });

  it("buildWebProjectInstructionBlock does not force ≤60-line default", () => {
    const prompt = buildWebProjectInstructionBlock({
      userBrief: "Landing page for Nova in navy and gold",
      stack: "html-static",
      brandName: "Nova",
      brandColors: ["navy", "gold"],
    });
    expect(prompt).not.toMatch(/≤60 lines/);
    expect(prompt).not.toMatch(/Keep EVERY string short/);
    expect(prompt).toMatch(/@keyframes|motion|imagery|production-quality|Claude/i);
    expect(prompt).toMatch(/picsum\.photos|unsplash|HTTPS <img>/i);
    expect(prompt).toMatch(/navy|gold|#/i);

    const retry = buildWebProjectInstructionBlock({
      userBrief: "Landing page for Nova",
      stack: "html-static",
      brandName: "Nova",
      isRetry: true,
    });
    expect(retry).toMatch(/SMALLER|Shorten/i);

    const designRetry = buildWebProjectInstructionBlock({
      userBrief: "Landing page for Nova",
      stack: "html-static",
      brandName: "Nova",
      isDesignRetry: true,
    });
    expect(designRetry).toMatch(/DESIGN RETRY|visually rich|Do NOT shrink/i);
  });
});
