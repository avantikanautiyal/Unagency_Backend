/**
 * Priority 4.2 — Non-browser modality evaluation (deterministic fixtures, no paid APIs).
 */

import JSZip from "jszip";
import {
  runEvaluationPlane,
  evaluateDocumentAdapter,
  evaluatePresentationAdapter,
  evaluateEmailAdapter,
  evaluateVideoAdapter,
  evaluateImageAdapter,
  EVALUATION_PLANE_VERSION,
} from "../../../src/platform/os/evaluation/evaluation-plane";
import { runArtifactEvaluation } from "../../../src/platform/os/evaluation/artifact-evaluation";
import {
  analyzePptxBytes,
  analyzeDocxBytes,
  analyzeEmailHtml,
  analyzeVideoBytes,
} from "../../../src/platform/os/evaluation/artifact-evaluation";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import type { HydratedArtifact } from "../../../src/platform/os/evaluation/artifact-evaluation/types";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const PDF_HEADER = Buffer.from("%PDF-1.4\n1 0 obj\n/Type /Page\n/Count 2\n/Title (Sample)\n%%EOF");

const EMAIL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Launch Email</title>
</head>
<body>
  <table><tr><td><h1>Product Launch</h1><p>Professional email campaign content.</p>
  <a href="https://example.com/start">Get Started</a></td></tr></table>
</body>
</html>`;

const BAD_EMAIL_HTML = `<html><body></body></html>`;

async function buildMinimalPptx(slides: readonly string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
  );
  zip.file("ppt/presentation.xml", "<p:presentation/>");
  slides.forEach((text, i) => {
    zip.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<p:sld><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sld>`,
    );
  });
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildMinimalDocx(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
  );
  zip.file(
    "word/document.xml",
    `<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

function buildMinimalMp4(): Buffer {
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write("ftyp", 4);
  ftyp.write("isom", 8);
  ftyp.writeUInt32BE(512, 16);

  const mvhdContent = Buffer.alloc(100);
  mvhdContent.writeUInt8(0, 0);
  mvhdContent.writeUInt32BE(1000, 12);
  mvhdContent.writeUInt32BE(5000, 16);
  const mvhd = Buffer.alloc(8 + mvhdContent.length);
  mvhd.writeUInt32BE(mvhdContent.length + 8, 0);
  mvhd.write("mvhd", 4);
  mvhdContent.copy(mvhd, 8);

  const hdlrContent = Buffer.alloc(24);
  hdlrContent.write("vide", 8);
  const hdlr = Buffer.alloc(8 + hdlrContent.length);
  hdlr.writeUInt32BE(hdlrContent.length + 8, 0);
  hdlr.write("hdlr", 4);
  hdlrContent.copy(hdlr, 8);

  const mdiaContent = Buffer.concat([hdlr]);
  const mdia = Buffer.alloc(8 + mdiaContent.length);
  mdia.writeUInt32BE(mdiaContent.length + 8, 0);
  mdia.write("mdia", 4);
  mdiaContent.copy(mdia, 8);

  const tkhdContent = Buffer.alloc(92);
  tkhdContent.writeUInt8(0, 0);
  tkhdContent.writeUInt32BE(1280 * 65536, 76);
  tkhdContent.writeUInt32BE(720 * 65536, 80);
  const tkhd = Buffer.alloc(8 + tkhdContent.length);
  tkhd.writeUInt32BE(tkhdContent.length + 8, 0);
  tkhd.write("tkhd", 4);
  tkhdContent.copy(tkhd, 8);

  const trakContent = Buffer.concat([tkhd, mdia]);
  const trak = Buffer.alloc(8 + trakContent.length);
  trak.writeUInt32BE(trakContent.length + 8, 0);
  trak.write("trak", 4);
  trakContent.copy(trak, 8);

  const moovContent = Buffer.concat([mvhd, trak]);
  const moov = Buffer.alloc(8 + moovContent.length);
  moov.writeUInt32BE(moovContent.length + 8, 0);
  moov.write("moov", 4);
  moovContent.copy(moov, 8);

  return Buffer.concat([ftyp, moov]);
}

function mockHydrated(artifacts: HydratedArtifact[]) {
  return async () => Object.freeze(artifacts);
}

describe("Priority 4.2 — Non-browser modality evaluation", () => {
  it("uses Evaluation Plane version p4.2.1", () => {
    expect(EVALUATION_PLANE_VERSION).toBe("p4.2.1");
  });

  describe("document modality", () => {
    it("measures PDF validity, page count, and text presence", async () => {
      const result = await evaluateDocumentAdapter(
        {
          executionId: "exec_doc",
          organizationId: "org",
          outputKind: "document",
          structuredOutput: { sections: [{ h: "A" }, { h: "B" }, { h: "C" }] },
        },
        [
          Object.freeze({
            artifactId: "art_pdf",
            mimeType: "application/pdf",
            byteSize: PDF_HEADER.length,
            bytes: PDF_HEADER,
            kind: "pdf" as const,
          }),
        ],
      );
      expect(result.metrics.find((m) => m.metricId === "document.valid_pdf")?.measurementStatus).toBe(
        "MEASURED",
      );
      expect(result.metrics.find((m) => m.metricId === "document.layout_score")?.measurementStatus).toBe(
        "HEURISTIC",
      );
    });

    it("measures DOCX readability and heading count", async () => {
      const docx = await buildMinimalDocx("Document body text for evaluation.");
      const result = await evaluateDocumentAdapter(
        { executionId: "exec_docx", organizationId: "org", outputKind: "document" },
        [
          Object.freeze({
            artifactId: "art_docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            byteSize: docx.length,
            bytes: docx,
            kind: "docx" as const,
          }),
        ],
      );
      expect(result.metrics.find((m) => m.metricId === "document.valid_docx")?.value).toBe(true);
      expect(result.metrics.find((m) => m.metricId === "document.heading_count")?.measurementStatus).toBe(
        "MEASURED",
      );
    });

    it("reports missing artifact explicitly", async () => {
      const result = await evaluateDocumentAdapter(
        { executionId: "exec_missing", organizationId: "org", outputKind: "document" },
        [],
      );
      expect(result.metrics.find((m) => m.metricId === "document.missing_artifact")).toBeDefined();
    });
  });

  describe("image modality", () => {
    it("measures dimensions, format, aspect ratio, and integrity", () => {
      const result = evaluateImageAdapter(
        { executionId: "exec_img", organizationId: "org", outputKind: "image" },
        Object.freeze({
          artifactId: "art_img",
          mimeType: "image/png",
          byteSize: PNG_1X1.length,
          bytes: PNG_1X1,
          kind: "image",
        }),
      );
      expect(result.metrics.find((m) => m.metricId === "image.width")?.measurementStatus).toBe("MEASURED");
      expect(result.metrics.find((m) => m.metricId === "image.format")?.value).toBe("png");
      expect(result.metrics.find((m) => m.metricId === "image.aspect_ratio")?.value).toBe("1:1");
      expect(result.metrics.find((m) => m.metricId === "image.aesthetic_quality")?.measurementStatus).toBe(
        "NOT_AUTOMATED",
      );
    });
  });

  describe("presentation modality", () => {
    it("measures PPTX slide count and empty slide detection", async () => {
      const pptx = await buildMinimalPptx(["Slide one content", ""]);
      const pres = await analyzePptxBytes(pptx);
      expect(pres.isValidPptx).toBe(true);
      expect(pres.slideCount).toBe(2);
      expect(pres.emptySlideCount).toBe(1);

      const result = await evaluatePresentationAdapter(
        { executionId: "exec_pres", organizationId: "org", outputKind: "presentation" },
        [
          Object.freeze({
            artifactId: "art_pptx",
            mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            byteSize: pptx.length,
            bytes: pptx,
            kind: "pptx" as const,
          }),
        ],
      );
      expect(result.metrics.find((m) => m.metricId === "presentation.slide_count")?.measurementStatus).toBe(
        "MEASURED",
      );
      expect(result.metrics.find((m) => m.metricId === "presentation.text_overflow")?.measurementStatus).toBe(
        "NOT_AUTOMATED",
      );
    });

    it("supports PDF + PPTX continuity", async () => {
      const pptx = await buildMinimalPptx(["Intro"]);
      const result = await evaluatePresentationAdapter(
        { executionId: "exec_pres2", organizationId: "org", outputKind: "presentation" },
        [
          Object.freeze({
            artifactId: "art_pdf",
            mimeType: "application/pdf",
            byteSize: PDF_HEADER.length,
            bytes: PDF_HEADER,
            kind: "pdf" as const,
          }),
          Object.freeze({
            artifactId: "art_pptx",
            mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            byteSize: pptx.length,
            bytes: pptx,
            kind: "pptx" as const,
          }),
        ],
      );
      expect(result.metrics.some((m) => m.metricId === "presentation.valid_pdf")).toBe(true);
      expect(result.metrics.some((m) => m.metricId === "presentation.valid_pptx")).toBe(true);
    });
  });

  describe("email modality", () => {
    it("measures objective email content signals", () => {
      const email = analyzeEmailHtml({ html: EMAIL_HTML, subject: "Launch Now" });
      expect(email.htmlValid).toBe(true);
      expect(email.subjectPresent).toBe(true);
      expect(email.ctaPresent).toBe(true);

      const result = evaluateEmailAdapter(
        {
          executionId: "exec_email",
          organizationId: "org",
          outputKind: "email",
          structuredOutput: { subject: "Launch Now" },
        },
        EMAIL_HTML,
        "art_email",
      );
      expect(result.metrics.find((m) => m.metricId === "email.subject_present")?.measurementStatus).toBe(
        "MEASURED",
      );
      expect(result.metrics.find((m) => m.metricId === "email.cross_client_compat")?.measurementStatus).toBe(
        "NOT_AUTOMATED",
      );
      expect(result.metrics.some((m) => m.measurementStatus === "HEURISTIC")).toBe(true);
    });

    it("detects empty email content", () => {
      const result = evaluateEmailAdapter(
        { executionId: "exec_bad_email", organizationId: "org", outputKind: "email" },
        BAD_EMAIL_HTML,
      );
      expect(result.metrics.find((m) => m.metricId === "email.content_present")?.value).toBe(false);
    });
  });

  describe("video modality", () => {
    it("measures MP4 container metadata from bytes", () => {
      const mp4 = buildMinimalMp4();
      const video = analyzeVideoBytes(mp4, "video/mp4");
      expect(video.containerFormat).toBe("mp4");
      expect(video.durationSec).toBeCloseTo(5, 0);
      expect(video.hasVideoStream).toBe(true);

      const result = evaluateVideoAdapter(
        Object.freeze({
          artifactId: "art_vid",
          mimeType: "video/mp4",
          byteSize: mp4.length,
          bytes: mp4,
          kind: "other" as const,
        }),
      );
      expect(result.metrics.find((m) => m.metricId === "video.duration_sec")?.measurementStatus).toBe(
        "MEASURED",
      );
      expect(result.metrics.find((m) => m.metricId === "video.quality_score")?.measurementStatus).toBe(
        "NOT_AUTOMATED",
      );
    });

    it("returns NOT_AUTOMATED detail metadata for unknown containers", () => {
      const video = analyzeVideoBytes(
        Buffer.from("not-a-video-file-content"),
        "application/octet-stream",
      );
      expect(video.evidence.some((e) => e.includes("NOT_AUTOMATED"))).toBe(true);
    });
  });

  describe("Evaluation Plane integration", () => {
    it("runs presentation evaluation through runEvaluationPlane", async () => {
      const pptx = await buildMinimalPptx(["Slide A", "Slide B"]);
      const { planeResult, enrichment } = await runEvaluationPlane({
        executionId: "exec_plane_pres",
        organizationId: "org_p42",
        outputKind: "presentation",
        mediaArtifactIds: ["art_pptx"],
        hydrateArtifacts: mockHydrated([
          Object.freeze({
            artifactId: "art_pptx",
            mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            byteSize: pptx.length,
            bytes: pptx,
            kind: "pptx" as const,
          }),
        ]),
      });
      expect(planeResult.planeVersion).toBe("p4.2.1");
      expect(planeResult.modesExecuted).toContain("rendered");
      expect(planeResult.stageTrace?.artifactRender).toBe("COMPLETED");
      expect(enrichment.artifactEvaluation.presentation?.evaluated).toBe(true);
    });

    it("preserves provenance fields on all metrics", async () => {
      const { planeResult } = await runEvaluationPlane({
        executionId: "exec_prov",
        organizationId: "org_p42",
        outputKind: "image",
        mediaArtifactIds: ["art_img"],
        hydrateArtifacts: mockHydrated([
          Object.freeze({
            artifactId: "art_img",
            mimeType: "image/png",
            byteSize: PNG_1X1.length,
            bytes: PNG_1X1,
            kind: "image" as const,
          }),
        ]),
      });
      for (const m of planeResult.metrics) {
        expect(m.metricId).toBeTruthy();
        expect(m.dimension).toBeTruthy();
        expect(m.measurementMethod).toBeTruthy();
        expect(m.evaluatorId).toBeTruthy();
        expect(m.evaluatorVersion).toBe("p4.2.1");
        expect(m.measurementStatus).toBeTruthy();
        expect(m.evidence.length).toBeGreaterThan(0);
        expect(m.confidence).toBeTruthy();
      }
    });
  });

  describe("Step 2 bridge integration", () => {
    it("passes video and email evidence into Step 2 validation input", async () => {
      const mp4 = buildMinimalMp4();
      const videoEnrichment = await runArtifactEvaluation({
        executionId: "exec_step2_vid",
        organizationId: "org_p42",
        outputKind: "video",
        service: "video",
        subtype: "explainer",
        mediaArtifactIds: ["art_vid"],
        hydrateArtifacts: mockHydrated([
          Object.freeze({
            artifactId: "art_vid",
            mimeType: "video/mp4",
            byteSize: mp4.length,
            bytes: mp4,
            kind: "other" as const,
          }),
        ]),
      });
      expect(videoEnrichment.artifactEvaluation.video?.evaluated).toBe(true);
      expect(videoEnrichment.artifactEvaluation.provenance.length).toBeGreaterThan(0);

      const emailEnrichment = await runArtifactEvaluation({
        executionId: "exec_step2_email",
        organizationId: "org_p42",
        outputKind: "email",
        service: "email",
        subtype: "campaign",
        mediaArtifactIds: ["art_email"],
        structuredData: { subject: "Launch" },
        hydrateArtifacts: mockHydrated([
          Object.freeze({
            artifactId: "art_email",
            mimeType: "text/html",
            byteSize: Buffer.byteLength(EMAIL_HTML),
            bytes: Buffer.from(EMAIL_HTML),
            kind: "html" as const,
            textContent: EMAIL_HTML,
          }),
        ]),
      });
      expect(emailEnrichment.artifactEvaluation.email?.evaluated).toBe(true);
    });
  });

  describe("production observability integration", () => {
    it("distinguishes evaluation_plane from runtime for document modality", async () => {
      const pptx = await buildMinimalPptx(["Slide content"]);
      const { planeResult } = await runEvaluationPlane({
        executionId: "exec_p42_obs",
        organizationId: "org_p42",
        outputKind: "presentation",
        mediaArtifactIds: ["art_pptx"],
        hydrateArtifacts: mockHydrated([
          Object.freeze({
            artifactId: "art_pptx",
            mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            byteSize: pptx.length,
            bytes: pptx,
            kind: "pptx" as const,
          }),
        ]),
      });
      expect(planeResult.stageTrace?.artifactRender).toBe("COMPLETED");
      expect(planeResult.stageTrace?.runtimeEvaluation).toBe("SKIPPED");
      expect(planeResult.stageTrace?.runtimeEvaluationReason).toBe("runtime_not_applicable_to_modality");
    });
  });

  it("adaptive routing remains OFF", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });
});
