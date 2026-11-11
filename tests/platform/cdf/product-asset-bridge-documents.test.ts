/**
 * Vault documents attached to a job (PDF/Word/ZIP) are split out of the
 * provider references: readable ones inform the brief as text, the rest are
 * skipped with a note. Reproduces the Nov 2-3 ZIP incident.
 */

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

let docxBase64 = "";
const skipCalls: string[] = [];

jest.mock("../../../src/services/attachment-role-classifier", () => ({
  classifyAttachmentRoles: jest.fn(async () => new Map()),
}));

jest.mock("../../../src/services/product-asset-service", () => ({
  productAssetService: {
    rememberAttachmentRole: jest.fn(async () => undefined),
    resolveProviderInputAsset: jest.fn(
      async (input: {
        assetId: string;
        organizationId: string;
        skipBytesForMimeType?: (m: string) => boolean;
      }) => {
        const base = { organizationId: input.organizationId, assetId: input.assetId };
        const files: Record<string, { mimeType: string; filename: string; b64: string; folder?: string }> = {
          logo: { mimeType: "image/png", filename: "Logo.png", b64: TINY_PNG, folder: "logos" },
          zip: {
            mimeType: "application/x-zip-compressed",
            filename: "ZESTO - Logo Pack.zip",
            b64: Buffer.from("PK\x03\x04zip", "latin1").toString("base64"),
          },
          docx: { mimeType: DOCX_MIME, filename: "Brand guidelines.docx", b64: docxBase64 },
          svg: { mimeType: "image/svg+xml", filename: "logo.svg", b64: Buffer.from("<svg/>").toString("base64") },
          blob: { mimeType: "application/octet-stream", filename: "voice", b64: Buffer.from("\x1aE\xdf\xa3webm", "latin1").toString("base64") },
          // A ZIP mislabelled as PNG — must be caught by its bytes.
          fakepng: {
            mimeType: "image/png",
            filename: "pack.png",
            b64: Buffer.from("PK\x03\x04zip", "latin1").toString("base64"),
          },
        };
        const f = files[input.assetId]!;
        if (input.skipBytesForMimeType?.(f.mimeType)) {
          skipCalls.push(input.assetId);
          return { ...base, mimeType: f.mimeType, filename: f.filename, storageRef: "k", bytesSkipped: true };
        }
        return {
          ...base,
          mimeType: f.mimeType,
          filename: f.filename,
          storageRef: "k",
          url: `data:${f.mimeType};base64,${f.b64}`,
          ...(f.folder ? { folder: f.folder } : {}),
        };
      },
    ),
  },
}));

import JSZip from "jszip";
import { attachProductAssetsToExecutionMetadata } from "../../../src/services/product-asset-input-bridge";
import { fitPromptToBudget } from "../../../src/platform/ai/canonical-model-request/fit-prompt-to-budget";
import { resolveCanonicalMultimodalContext } from "../../../src/platform/cdf/generation-context/resolve-multimodal-context";

beforeAll(async () => {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    '<w:document><w:body><w:p><w:r><w:t>ZESTO brand guidelines</w:t></w:r></w:p>' +
      "<w:p><w:r><w:t>Primary colour is tangerine #FF7A00. Never stretch the logo.</w:t></w:r></w:p></w:body></w:document>",
  );
  docxBase64 = (await zip.generateAsync({ type: "nodebuffer" })).toString("base64");
});

describe("product-asset-input-bridge — documents are not image references", () => {
  it("keeps only real images as references; ZIP skipped without download", async () => {
    skipCalls.length = 0;
    const meta = await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      metadata: { assetIds: ["zip", "logo"] },
    });
    const assets = meta.assets as Array<Record<string, unknown>>;
    expect(assets.map((a) => a.assetId)).toEqual(["logo"]);
    expect(meta.assetIds).toEqual(["logo"]);
    expect(meta.referenceDocumentIds).toEqual(["zip"]);
    expect(meta.referenceDocuments).toEqual([
      expect.objectContaining({
        assetId: "zip",
        fileName: "ZESTO - Logo Pack.zip",
        usedAs: "skipped",
        skipReason: "unsupported_file_type",
      }),
    ]);
    expect(skipCalls).toEqual(["zip"]);
    expect(meta.attachedDocumentsSection).toBeUndefined();
  });

  it("turns a Word document into brief text", async () => {
    const meta = await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      metadata: { assetIds: ["docx", "logo"] },
    });
    expect((meta.assets as unknown[]).length).toBe(1);
    expect(meta.referenceDocuments).toEqual([
      expect.objectContaining({ assetId: "docx", usedAs: "brief_text" }),
    ]);
    const mm = meta.multimodalAttachments as Array<Record<string, unknown>>;
    expect(mm).toHaveLength(1);
    expect(mm[0]!.extractedText).toContain("tangerine #FF7A00");
    expect(mm[0]!.hasVisualProviderRef).toBe(false);
    const section = String(meta.attachedDocumentsSection);
    expect(section.startsWith("===== ATTACHED DOCUMENTS =====")).toBe(true);
    expect(section).toContain("Brand guidelines.docx");
    expect(section).toContain("Never stretch the logo.");
  });

  it("document text reaches the canonical prompt's multimodal context, not as a visual", async () => {
    const meta = await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      metadata: { assetIds: ["docx", "logo"] },
    });
    const ctx = resolveCanonicalMultimodalContext({ metadata: meta, organizationId: "org_1" });
    const doc = ctx.items.find((i) => i.assetId === "docx");
    expect(doc?.deliveryStatus).toBe("extracted_text_only");
    expect(doc?.hasVisualProviderRef).toBe(false);
    expect(doc?.extractedText).toContain("tangerine #FF7A00");
    expect(ctx.items.find((i) => i.assetId === "logo")?.hasVisualProviderRef).toBe(true);
  });

  it("catches a ZIP saved with an image type by its bytes", async () => {
    const meta = await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      metadata: { assetIds: ["fakepng"] },
    });
    expect(meta.assetIds).toEqual([]);
    expect(meta.image).toBeUndefined();
    expect(meta.referenceDocuments).toEqual([
      expect.objectContaining({ assetId: "fakepng", mimeType: "application/zip", usedAs: "skipped" }),
    ]);
  });

  it("SVG is skipped as an unsupported image format; unknown bytes keep old behaviour", async () => {
    const meta = await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      metadata: { assetIds: ["svg", "blob"] },
    });
    expect(meta.referenceDocuments).toEqual([
      expect.objectContaining({ assetId: "svg", skipReason: "unsupported_image_format" }),
    ]);
    expect((meta.assets as Array<Record<string, unknown>>).map((a) => a.assetId)).toEqual(["blob"]);
  });

  it("keeps existing message attachments when adding document text", async () => {
    const meta = await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      metadata: { assetIds: ["docx"], attachments: [{ assetId: "chat1", mimeType: "image/png" }] },
    });
    const mm = meta.multimodalAttachments as Array<Record<string, unknown>>;
    expect(mm.map((a) => a.assetId)).toEqual(["chat1", "docx"]);
  });

  it("the documents section is trimmed first when an image prompt is too long", () => {
    const body = "x".repeat(5_000);
    const prompt = `Make a pack design.\n\n===== BRAND CONTEXT =====\n${body}\n\n===== ATTACHED DOCUMENTS =====\n${body}`;
    const fitted = fitPromptToBudget(prompt, 8_000);
    expect(fitted.report?.trimmedSections[0]).toBe("ATTACHED DOCUMENTS");
  });
});
