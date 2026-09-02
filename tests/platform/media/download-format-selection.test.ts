/**
 * Raster download conversion + format validation for artifact media delivery.
 */

import {
  canConvertRasterFormat,
  convertRasterImage,
  mimeForRasterFormat,
  normalizeRasterFormat,
} from "../../../src/platform/media/delivery/image-format-converter";
import { validateRequestedDownloadFormat } from "../../../src/platform/media/delivery/media-delivery-service";
import { PNG } from "pngjs";
import * as jpeg from "jpeg-js";
import {
  downloadFormatsForKind,
  SERVICE_OUTPUT_MAP,
  type ServiceOutputSpec,
} from "../../../src/platform/config/service-output-map";

function makePngBuffer(width = 4, height = 4): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    png.data[o] = 255;
    png.data[o + 1] = 0;
    png.data[o + 2] = 128;
    png.data[o + 3] = 255;
  }
  return PNG.sync.write(png);
}

function makeJpgBuffer(width = 4, height = 4): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    data[o] = 10;
    data[o + 1] = 200;
    data[o + 2] = 40;
    data[o + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ data, width, height }, 90).data);
}

describe("image download format conversion", () => {
  it("selecting PNG from PNG passes through", () => {
    const src = makePngBuffer();
    const out = convertRasterImage({
      bytes: src,
      sourceMime: "image/png",
      targetFormat: "png",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.contentType).toBe("image/png");
    expect(out.value.bytes.subarray(0, 4).toString("hex")).toBe("89504e47");
  });

  it("selecting JPG from PNG converts to JPEG", () => {
    const src = makePngBuffer();
    const out = convertRasterImage({
      bytes: src,
      sourceMime: "image/png",
      targetFormat: "jpg",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.contentType).toBe("image/jpeg");
    expect(out.value.bytes[0]).toBe(0xff);
    expect(out.value.bytes[1]).toBe(0xd8);
  });

  it("selecting PNG from JPG converts to PNG", () => {
    const src = makeJpgBuffer();
    const out = convertRasterImage({
      bytes: src,
      sourceMime: "image/jpeg",
      targetFormat: "png",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.contentType).toBe("image/png");
    expect(out.value.bytes.subarray(0, 4).toString("hex")).toBe("89504e47");
  });

  it("normalizes jpeg alias to jpg", () => {
    expect(normalizeRasterFormat("jpeg")).toBe("jpg");
    expect(mimeForRasterFormat("jpg")).toBe("image/jpeg");
  });
});

describe("backend rejects unsupported format requests", () => {
  it("rejects SVG for raster PNG artifacts", () => {
    const result = validateRequestedDownloadFormat({
      sourceMime: "image/png",
      requested: "svg",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects PDF for raster PNG artifacts", () => {
    const result = validateRequestedDownloadFormat({
      sourceMime: "image/png",
      requested: "pdf",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects JPG for PDF artifacts (no silent substitute)", () => {
    const result = validateRequestedDownloadFormat({
      sourceMime: "application/pdf",
      requested: "jpg",
    });
    expect(result.ok).toBe(false);
  });

  it("allows PDF for PDF artifacts", () => {
    const result = validateRequestedDownloadFormat({
      sourceMime: "application/pdf",
      requested: "pdf",
    });
    expect(result.ok).toBe(true);
  });

  it("allows PNG/JPG conversion for raster sources", () => {
    expect(
      canConvertRasterFormat({
        sourceMime: "image/png",
        requestedFormat: "jpg",
      })
    ).toBe(true);
    const ok = validateRequestedDownloadFormat({
      sourceMime: "image/png",
      requested: "jpg",
    });
    expect(ok.ok).toBe(true);
  });
});

describe("no service exposes formats its exporter cannot produce", () => {
  const entries = Object.entries(SERVICE_OUTPUT_MAP) as [
    string,
    ServiceOutputSpec,
  ][];

  it("supportedDownloadFormats match downloadFormatsForKind for every entry", () => {
    for (const [key, spec] of entries) {
      const expected = downloadFormatsForKind(spec.kind);
      expect({
        key,
        formats: [...spec.supportedDownloadFormats],
      }).toEqual({
        key,
        formats: [...expected.supportedDownloadFormats],
      });
      // Raster kinds must not advertise SVG (no vector exporter today).
      if (spec.kind.startsWith("image") || spec.kind === "edited_image") {
        expect(spec.supportedDownloadFormats.includes("svg")).toBe(false);
      }
    }
  });
});
