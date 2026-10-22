import JSZip from "jszip";
import {
  buildDeckDocument,
  renderDesignedDeck,
} from "../../../../src/platform/os/delivery/presentation-html/slide-renderer";
import {
  dropStrayParagraphProps,
  presentationPptxMode,
} from "../../../../src/platform/os/delivery/presentation-html/slide-editable-pptx";

// 4×4 red PNG.
const PHOTO = {
  mimeType: "image/png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKY52fTcuYAAAAAElFTkSuQmCC",
};

const deck = {
  fonts: [] as string[],
  themeCss: `.slide{background:#F7F5F0;font-family:Helvetica,Arial,sans-serif;color:#14213D}
.q::before{content:"\\201C";display:block;font-size:120px;line-height:.6;color:#FCA311}`,
  slides: [
    // Photo under a gradient overlay: must stay in the background image.
    `<section class="slide">
      <img src="{{IMAGE_1}}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
      <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.8),rgba(0,0,0,0))"></div>
      <h1 style="position:absolute;left:140px;top:300px;margin:0;font-size:96px;color:#fff">Growing beyond the shelf</h1>
    </section>`,
    `<section class="slide" style="padding:120px 140px">
      <p style="margin:0;width:520px;font-size:40px;line-height:60px">of revenue comes from two retail partners today</p>
      <div style="margin-top:60px;width:600px;height:200px;background:#14213D;border-radius:24px"></div>
      <blockquote class="q" style="margin:60px 0 0;width:900px;font-size:48px;line-height:60px">Customers who buy direct come back.</blockquote>
      <img src="{{LOGO}}" style="position:absolute;right:60px;bottom:40px;width:80px;height:80px;object-fit:contain">
    </section>`,
  ],
};

describe("editable PPTX from designed HTML slides", () => {
  jest.setTimeout(120_000);

  it("lifts text, pictures and plain shapes; keeps what PowerPoint cannot draw in the background", async () => {
    const html = buildDeckDocument({ deck, images: new Map([[1, PHOTO]]), logo: PHOTO });
    const rendered = await renderDesignedDeck({ html, expectedSlides: 2, editable: true });
    const [cover, stats] = rendered.editableLayers ?? [];
    expect(cover && stats).toBeTruthy();

    // Cover: headline is native text; the photo has an overlay on top, so it stays in the background.
    expect(cover!.texts.map((t) => t.runs.map((r) => r.text).join(""))).toContain("Growing beyond the shelf");
    expect(cover!.images).toHaveLength(0);

    // Wrapped paragraph keeps Chrome's line breaks as soft breaks.
    const para = stats!.texts.find((t) => t.runs.some((r) => r.text.startsWith("of revenue")))!;
    expect(para.lines).toBeGreaterThan(1);
    expect(para.runs.some((r) => r.breakBefore)).toBe(true);
    expect(para.runs.map((r) => r.text).join(" ").replace(/\s+/g, " ")).toBe(
      "of revenue comes from two retail partners today",
    );

    // Solid rounded box → native rounded rectangle; logo → native picture.
    expect(stats!.shapes).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "roundRect", fill: { hex: "14213D", alpha: 1 } })]),
    );
    expect(stats!.images).toHaveLength(1);

    // Block-level ::before quote mark stays in the background, not in the text.
    const quote = stats!.texts.find((t) => t.runs.some((r) => r.text.includes("Customers")))!;
    expect(quote.runs.map((r) => r.text).join("")).not.toContain("“");

    // (Building the PPTX itself is not exercised here: pptxgenjs needs --experimental-vm-modules under jest.)
  });

  it("keeps one leading <a:pPr> per paragraph (pptxgenjs repeats it after runs and soft breaks)", async () => {
    const zip = new JSZip();
    const para =
      '<a:p><a:pPr algn="l"><a:buChar char="•"/></a:pPr><a:r><a:t>Launch a</a:t></a:r><a:br/>' +
      '<a:pPr algn="l" indent="0"><a:buNone/></a:pPr><a:r><a:t>bundle</a:t></a:r>' +
      '<a:pPr algn="l"/><a:r><a:t> now</a:t></a:r></a:p>';
    zip.file("ppt/slides/slide1.xml", `<p:sld>${para}</p:sld>`);
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    const fixed = await dropStrayParagraphProps(await zip.generateAsync({ type: "nodebuffer" }));
    const xml = await (await JSZip.loadAsync(fixed)).file("ppt/slides/slide1.xml")!.async("string");
    expect(xml).toBe(
      '<p:sld><a:p><a:pPr algn="l"><a:buChar char="•"/></a:pPr><a:r><a:t>Launch a</a:t></a:r><a:br/>' +
        "<a:r><a:t>bundle</a:t></a:r><a:r><a:t> now</a:t></a:r></a:p></p:sld>",
    );
  });

  it("defaults to editable and can be switched back to image slides", () => {
    const prev = process.env.PRESENTATION_PPTX_MODE;
    try {
      delete process.env.PRESENTATION_PPTX_MODE;
      expect(presentationPptxMode()).toBe("editable");
      process.env.PRESENTATION_PPTX_MODE = "image";
      expect(presentationPptxMode()).toBe("image");
    } finally {
      if (prev === undefined) delete process.env.PRESENTATION_PPTX_MODE;
      else process.env.PRESENTATION_PPTX_MODE = prev;
    }
  });
});
