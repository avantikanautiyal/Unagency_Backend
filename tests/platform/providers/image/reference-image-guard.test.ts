/**
 * Non-image files (ZIP, PDF, Word) must never reach an image or vision model
 * as a reference — every provider rejects them with HTTP 400.
 */

import { extractReferenceImages } from "../../../../src/platform/providers/image/common/vendor-image-protocol";
import { extractVisionImageRefs } from "../../../../src/platform/providers/common/vision-content";
import {
  screenReferenceImage,
  sniffFileType,
} from "../../../../src/platform/providers/common/reference-image-guard";
import type { ProviderAdapterRequest } from "../../../../src/platform/providers/adapters/contracts/adapter-io";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString("base64");
const ZIP_B64 = Buffer.from("PK\x03\x04\x14\x00\x00\x00rest-of-zip", "latin1").toString("base64");
const PDF_B64 = Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj", "latin1").toString("base64");

function visionRequest(input: Record<string, unknown>): ProviderAdapterRequest {
  return { input } as unknown as ProviderAdapterRequest;
}

describe("reference image guard", () => {
  it("sniffs real file types from leading bytes", () => {
    expect(sniffFileType(Buffer.from(PNG_B64, "base64"))).toBe("image/png");
    expect(sniffFileType(Buffer.from(JPEG_B64, "base64"))).toBe("image/jpeg");
    expect(sniffFileType(Buffer.from(ZIP_B64, "base64"))).toBe("application/zip");
    expect(sniffFileType(Buffer.from(PDF_B64, "base64"))).toBe("application/pdf");
  });

  it("rejects a ZIP even when it is labelled as a PNG", () => {
    const screened = screenReferenceImage({ url: `data:image/png;base64,${ZIP_B64}` });
    expect(screened).toMatchObject({ ok: false, detectedMimeType: "application/zip" });
  });

  it("rejects a non-image http URL by declared type, accepts unknown http images", () => {
    expect(screenReferenceImage({ url: "https://x/doc.pdf", mimeType: "application/pdf" }).ok).toBe(false);
    expect(screenReferenceImage({ url: "https://x/a.png" })).toMatchObject({ ok: true, mimeType: "image/png" });
  });

  it("extractReferenceImages drops ZIP/PDF/Word data URLs and keeps real images", () => {
    const refs = extractReferenceImages({
      assets: [
        { assetId: "zip", mimeType: "application/x-zip-compressed", url: `data:application/x-zip-compressed;base64,${ZIP_B64}` },
        { assetId: "pdf", mimeType: "application/pdf", url: `data:application/pdf;base64,${PDF_B64}` },
        {
          assetId: "docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          url: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${ZIP_B64}`,
        },
        { assetId: "logo", mimeType: "image/png", url: `data:image/png;base64,${PNG_B64}` },
      ],
    });
    expect(refs.map((r) => r.assetId)).toEqual(["logo"]);
    expect(refs[0]!.mimeType).toBe("image/png");
  });

  it("corrects a JPEG stored as image/png", () => {
    const refs = extractReferenceImages({
      image: { assetId: "photo", mimeType: "image/png", url: `data:image/png;base64,${JPEG_B64}` },
    });
    expect(refs).toHaveLength(1);
    expect(refs[0]!.mimeType).toBe("image/jpeg");
    expect(refs[0]!.url?.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("keeps existing behaviour for http image URLs and plain base64 images", () => {
    const refs = extractReferenceImages({
      assets: [
        { assetId: "remote", url: "https://cdn.example.com/a.png" },
        { assetId: "raw", mimeType: "image/webp", base64: "AAAA" },
      ],
    });
    expect(refs.map((r) => r.assetId)).toEqual(["remote", "raw"]);
  });

  it("vision refs skip documents instead of labelling them image/png", () => {
    const refs = extractVisionImageRefs(
      visionRequest({
        assets: [
          { mimeType: "application/pdf", url: `data:application/pdf;base64,${PDF_B64}` },
          { mimeType: "application/zip", base64: ZIP_B64 },
          { mimeType: "image/png", base64: PNG_B64 },
        ],
      }),
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]!.mimeType).toBe("image/png");
  });
});
