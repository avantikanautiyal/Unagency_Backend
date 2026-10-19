import { PNG } from "pngjs";
import * as jpeg from "jpeg-js";
import {
  cropDesign,
  matchEmailToApprovedDesign,
  parseDesignMatchResponse,
  type ApprovedEmailDesign,
} from "../../../../src/platform/os/delivery/email-design-match";

function solidPng(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  png.data.fill(200);
  return PNG.sync.write(png);
}

const plan = {
  title: "Thank you",
  subject: "Thank you from Cravino",
  preheader: "Welcome",
  html: "<html><body>generic</body></html>",
  textFallback: "Thank You. We're grateful you've chosen Cravino.",
};

const design: ApprovedEmailDesign = {
  bytes: solidPng(400, 300),
  mimeType: "image/png",
  width: 400,
  height: 300,
  phaseId: "email-design",
  artifactId: "cdfart_test",
};

describe("email design match", () => {
  test("crops a pixel box into a JPEG of that size", () => {
    const out = cropDesign(design, { x: 350, y: 10, w: 100, h: 50 })!;
    const img = jpeg.decode(out);
    expect(img.width).toBe(50); // clamped to the image edge
    expect(img.height).toBe(50);
  });

  test("parses crops and HTML from the marker format", () => {
    const parsed = parseDesignMatchResponse(
      '<<<CROPS>>>\n[{"id":"hero","image":1,"x":1,"y":2,"w":30,"h":40}]\n<<<HTML>>>\n<html><body></body></html>',
    );
    expect(parsed.crops).toEqual([{ id: "hero", image: 1, x: 1, y: 2, w: 30, h: 40 }]);
    expect(parsed.html).toContain("<html>");
  });

  test("rebuilds HTML from the approved design and publishes crops", async () => {
    let sentImage = false;
    const result = await matchEmailToApprovedDesign({
      plan,
      organizationId: "org1",
      executionId: "exec1",
      loadDesigns: async () => [design],
      callModel: async (blocks) => {
        sentImage = blocks.some((b) => b.type === "image");
        return '<<<CROPS>>>\n[{"id":"hero","image":1,"x":0,"y":0,"w":100,"h":100}]\n<<<HTML>>>\n<html><body><img src="{{CROP:hero}}" alt="bottle"><img src="{{CROP:missing}}"></body></html>';
      },
      publish: async ({ id }) => `https://cdn.test/${id}.jpg`,
    });
    expect(sentImage).toBe(true);
    expect(result?.html).toContain('src="https://cdn.test/hero.jpg"');
    expect(result?.html).not.toContain("{{CROP");
    expect(result?.cropCount).toBe(1);
  });

  test("returns undefined when no design was approved", async () => {
    const result = await matchEmailToApprovedDesign({
      plan,
      organizationId: "org1",
      executionId: "exec1",
      loadDesigns: async () => [],
      callModel: async () => {
        throw new Error("should not be called");
      },
    });
    expect(result).toBeUndefined();
  });
});
