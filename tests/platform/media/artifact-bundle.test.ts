/**
 * Logo Pack style ZIP bundles: each raster source ships as PNG, JPG and PDF.
 */

import JSZip from "jszip";
import { PNG } from "pngjs";
import { buildArtifactBundleZip } from "../../../src/platform/media/delivery/artifact-bundle";

function makePngBuffer(width = 4, height = 4): Buffer {
  const png = new PNG({ width, height });
  png.data.fill(200);
  return PNG.sync.write(png);
}

describe("buildArtifactBundleZip", () => {
  it("packs every logo as png, jpg and pdf plus a readme", async () => {
    const result = await buildArtifactBundleZip({
      files: [
        { name: "primary-logo", bytes: makePngBuffer(), mimeType: "image/png" },
        { name: "logo-system", bytes: makePngBuffer(), mimeType: "image/png" },
      ],
      readme: "Logo Pack",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = [
      "primary-logo.png",
      "primary-logo.jpg",
      "primary-logo.pdf",
      "logo-system.png",
      "logo-system.jpg",
      "logo-system.pdf",
      "README.txt",
    ];
    expect(result.value.entryNames).toEqual(expected);

    const zip = await JSZip.loadAsync(result.value.bytes);
    expect(Object.keys(zip.files).sort()).toEqual([...expected].sort());
    const jpg = await zip.file("primary-logo.jpg")!.async("nodebuffer");
    expect(jpg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    const pdf = await zip.file("logo-system.pdf")!.async("nodebuffer");
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("rejects an empty bundle", async () => {
    const result = await buildArtifactBundleZip({ files: [] });
    expect(result.ok).toBe(false);
  });
});
