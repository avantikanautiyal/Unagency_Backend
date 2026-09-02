/**
 * After structured PresentationPlan / PresentationRoutes / DocumentPlan / EmailPlan,
 * materialize downloadable artifacts:
 * - presentations → PDF + PPTX
 * - documents → PDF + DOCX
 * - email → HTML (+ optional plain text)
 */

import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
import type { AsyncMediaPlatform } from "../../infrastructure/durability/create-async-media-platform";
import {
  buildBrochurePdf,
  buildDocumentDocx,
  buildDocumentPdf,
  buildPresentationPdf,
  buildPresentationPptx,
  parseDocumentPlan,
  parsePresentationPlan,
  parsePresentationRoutes,
  recoverPresentationRoutesPayload,
  type PresentationExportOptions,
  type PresentationPlan,
  type PresentationRoutePlan,
} from "../../os/delivery/document-export-service";
import { parseEmailPlan } from "../../os/delivery/email-generation";
import {
  validateDocumentPlanRelevance,
} from "../../os/delivery/document-generation";
import { extractBrandNameFromMegaprompt } from "../../os/delivery/presentation-generation";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";
const HTML_MIME = "text/html; charset=utf-8";
const TEXT_MIME = "text/plain; charset=utf-8";

export type DocumentExportKind = "presentation" | "document" | "email";

type ExportFileLabel = "pdf" | "pptx" | "docx" | "html" | "txt";

function resolvePresentationExportOptions(
  metadata?: Readonly<Record<string, unknown>>
): PresentationExportOptions {
  const meta = metadata ?? {};
  const userBrief =
    (typeof meta.userBrief === "string" && meta.userBrief.trim()) ||
    (typeof meta.websiteUserBrief === "string" && meta.websiteUserBrief.trim()) ||
    "";
  const brandName =
    (typeof meta.brandName === "string" && meta.brandName.trim()) ||
    (typeof meta.requiredBrandName === "string" &&
      meta.requiredBrandName.trim()) ||
    (userBrief ? extractBrandNameFromMegaprompt(userBrief) : undefined);
  const brandColors: string[] = [];
  const pushColor = (v: unknown) => {
    if (typeof v === "string" && v.trim()) brandColors.push(v.trim());
    if (Array.isArray(v)) {
      for (const c of v) {
        if (typeof c === "string" && c.trim()) brandColors.push(c.trim());
      }
    }
  };
  pushColor(meta.learnedBrandColors);
  pushColor(meta.brandColors);
  pushColor(meta.briefExtractedColors);
  return {
    ...(brandName ? { brandName } : {}),
    ...(brandColors.length ? { brandColors: [...new Set(brandColors)] } : {}),
  };
}

function tryParseJsonObject(text: unknown): Record<string, unknown> | undefined {
  if (typeof text !== "string" || !text.trim()) return undefined;
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
    return undefined;
  }
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function isPresentationShapedPayload(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const rec = data as Record<string, unknown>;
  if (Array.isArray(rec.routes) || Array.isArray(rec.concepts)) return true;
  if (
    Array.isArray(rec.slides) &&
    !Array.isArray(rec.sections) &&
    !Array.isArray(rec.chapters) &&
    !Array.isArray(rec.pages)
  ) {
    return true;
  }
  return Boolean(parsePresentationRoutes(rec) || parsePresentationPlan(rec));
}

function isLaunchPlanShapedPayload(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const rec = data as Record<string, unknown>;
  return (
    Array.isArray(rec.steps) &&
    rec.steps.length > 0 &&
    !Array.isArray(rec.sections) &&
    !Array.isArray(rec.chapters) &&
    !Array.isArray(rec.pages)
  );
}

function coerceTowardDocumentPlan(
  data: Record<string, unknown>
): Record<string, unknown> | undefined {
  // Never remap presentation-shaped or LaunchPlan payloads into documents.
  if (isPresentationShapedPayload(data) || isLaunchPlanShapedPayload(data)) {
    return undefined;
  }
  const title =
    (typeof data.title === "string" && data.title.trim()) ||
    (typeof data.deliverable === "string" && data.deliverable.trim()) ||
    (typeof data.name === "string" && data.name.trim()) ||
    (typeof data.headline === "string" && data.headline.trim()) ||
    "";
  const summary =
    (typeof data.summary === "string" && data.summary.trim()) ||
    (typeof data.overview === "string" && data.overview.trim()) ||
    (typeof data.description === "string" && data.description.trim()) ||
    title;
  const rawSections = Array.isArray(data.sections)
    ? data.sections
    : Array.isArray(data.chapters)
      ? data.chapters
      : Array.isArray(data.pages)
        ? data.pages
        : [];
  const sections: Array<{ heading: string; body: string }> = [];
  for (const item of rawSections) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const heading =
      (typeof row.heading === "string" && row.heading.trim()) ||
      (typeof row.title === "string" && row.title.trim()) ||
      (typeof row.name === "string" && row.name.trim()) ||
      (typeof row.label === "string" && row.label.trim()) ||
      "";
    let body =
      (typeof row.body === "string" && row.body.trim()) ||
      (typeof row.content === "string" && row.content.trim()) ||
      (typeof row.description === "string" && row.description.trim()) ||
      (typeof row.text === "string" && row.text.trim()) ||
      (typeof row.summary === "string" && row.summary.trim()) ||
      "";
    if (!body && Array.isArray(row.bullets)) {
      body = row.bullets
        .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
        .map((b) => b.trim())
        .join("\n");
    }
    if (heading && body) sections.push({ heading, body });
  }
  if (!title || sections.length === 0) return undefined;
  while (sections.length < 3) {
    const index = sections.length;
    sections.push({
      heading: `Section ${index + 1}`,
      body: summary || title,
    });
  }
  return { title, summary: summary || title, sections };
}

function recoverExportStructuredData(data: unknown): unknown {
  if (data == null) return data;
  return recoverPresentationRoutesPayload(data);
}

function pickStructuredData(
  runtimeOutput: Readonly<Record<string, unknown>> | undefined,
  jobSummary: Readonly<Record<string, unknown>> | undefined,
  exportKind?: DocumentExportKind
): unknown {
  const direct =
    jobSummary?.structuredData ??
    runtimeOutput?.structured ??
    runtimeOutput?.structuredOutput ??
    (runtimeOutput?.data != null && typeof runtimeOutput.data === "object"
      ? runtimeOutput.data
      : undefined);
  if (direct != null) {
    if (typeof direct === "object" && !Array.isArray(direct)) {
      const rec = recoverExportStructuredData(direct) as Record<string, unknown>;
      if (exportKind === "document") {
        if (isPresentationShapedPayload(rec) || isLaunchPlanShapedPayload(rec)) {
          return undefined;
        }
        if (parseDocumentPlan(rec)) return rec;
        const asDoc = coerceTowardDocumentPlan(rec);
        return asDoc ?? undefined;
      }
      if (exportKind === "presentation") {
        if (parsePresentationRoutes(rec) || parsePresentationPlan(rec)) {
          return rec;
        }
        return undefined;
      }
      if (
        parsePresentationRoutes(rec) ||
        parsePresentationPlan(rec) ||
        Array.isArray(rec.routes) ||
        Array.isArray(rec.concepts) ||
        Array.isArray(rec.slides)
      ) {
        return rec;
      }
      const asDoc = coerceTowardDocumentPlan(rec);
      if (asDoc) return asDoc;
    }
    return direct;
  }

  if (exportKind === "document") {
    // Do not soft-recover DocumentPlan from prose — required documents must fail.
    return undefined;
  }

  const fromSummary = tryParseJsonObject(jobSummary?.resultText);
  if (fromSummary) {
    if (exportKind === "presentation") {
      if (
        parsePresentationPlan(fromSummary) ||
        parsePresentationRoutes(fromSummary)
      ) {
        return fromSummary;
      }
      return undefined;
    }
    const coerced = coerceTowardDocumentPlan(fromSummary);
    if (
      coerced ||
      parseDocumentPlan(fromSummary) ||
      parsePresentationPlan(fromSummary) ||
      parsePresentationRoutes(fromSummary)
    ) {
      return coerced ?? fromSummary;
    }
  }
  const fromRuntime = tryParseJsonObject(runtimeOutput?.content);
  if (fromRuntime) {
    if (exportKind === "presentation") {
      if (
        parsePresentationPlan(fromRuntime) ||
        parsePresentationRoutes(fromRuntime)
      ) {
        return fromRuntime;
      }
      return undefined;
    }
    const coerced = coerceTowardDocumentPlan(fromRuntime);
    if (
      coerced ||
      parseDocumentPlan(fromRuntime) ||
      parsePresentationPlan(fromRuntime) ||
      parsePresentationRoutes(fromRuntime)
    ) {
      return coerced ?? fromRuntime;
    }
  }
  return undefined;
}

async function ingestExportFiles(input: {
  readonly asyncMedia: AsyncMediaPlatform;
  readonly executionId: string;
  readonly organizationId: string;
  readonly exportKind: DocumentExportKind;
  readonly createId: (prefix: string) => string;
  readonly providerId: string;
  readonly modelId: string;
  readonly files: ReadonlyArray<{
    readonly label: ExportFileLabel;
    readonly mimeType: string;
    readonly buffer: Buffer;
  }>;
}): Promise<
  Result<{
    artifactIds: string[];
    pdfArtifactId?: string;
    pptxArtifactId?: string;
    docxArtifactId?: string;
    htmlArtifactId?: string;
  }>
> {
  const operationId = input.createId("docexport");
  const capabilityId =
    input.exportKind === "presentation"
      ? "output.presentation"
      : input.exportKind === "email"
        ? "output.email"
        : "output.document";

  const artifactIds: string[] = [];
  let pdfArtifactId: string | undefined;
  let pptxArtifactId: string | undefined;
  let docxArtifactId: string | undefined;
  let htmlArtifactId: string | undefined;

  for (let index = 0; index < input.files.length; index += 1) {
    const file = input.files[index]!;
    const artifactId = input.asyncMedia.artifacts.buildArtifactId(
      operationId,
      index
    );
    const ingested = await input.asyncMedia.ingestion.ingest({
      organizationId: input.organizationId,
      executionId: input.executionId,
      artifactId,
      outputIndex: index,
      base64: file.buffer.toString("base64"),
      mimeType: file.mimeType,
    });
    if (!ingested.ok) return ingested;

    await input.asyncMedia.artifacts.finalize({
      operationId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      outputIndex: index,
      blob: ingested.value,
      providerId: input.providerId,
      modelId: input.modelId,
      capabilityId,
    });

    artifactIds.push(artifactId);
    if (file.label === "pdf") pdfArtifactId = artifactId;
    if (file.label === "pptx") pptxArtifactId = artifactId;
    if (file.label === "docx") docxArtifactId = artifactId;
    if (file.label === "html") htmlArtifactId = artifactId;
  }

  return success({
    artifactIds,
    ...(pdfArtifactId ? { pdfArtifactId } : {}),
    ...(pptxArtifactId ? { pptxArtifactId } : {}),
    ...(docxArtifactId ? { docxArtifactId } : {}),
    ...(htmlArtifactId ? { htmlArtifactId } : {}),
  });
}

async function ingestPresentationPair(input: {
  readonly asyncMedia: AsyncMediaPlatform;
  readonly executionId: string;
  readonly organizationId: string;
  readonly createId: (prefix: string) => string;
  readonly providerId: string;
  readonly modelId: string;
  readonly pdfBuf: Buffer;
  readonly pptxBuf: Buffer;
}): Promise<
  Result<{
    artifactIds: string[];
    pdfArtifactId: string;
    pptxArtifactId: string;
  }>
> {
  const result = await ingestExportFiles({
    ...input,
    exportKind: "presentation",
    files: [
      { label: "pdf", mimeType: PDF_MIME, buffer: input.pdfBuf },
      { label: "pptx", mimeType: PPTX_MIME, buffer: input.pptxBuf },
    ],
  });
  if (!result.ok) return result;
  if (!result.value.pdfArtifactId || !result.value.pptxArtifactId) {
    return failure(
      new ValidationError("Presentation export missing PDF or PPTX artifact")
    );
  }
  return success({
    artifactIds: result.value.artifactIds,
    pdfArtifactId: result.value.pdfArtifactId,
    pptxArtifactId: result.value.pptxArtifactId,
  });
}

async function ingestDocumentPair(input: {
  readonly asyncMedia: AsyncMediaPlatform;
  readonly executionId: string;
  readonly organizationId: string;
  readonly createId: (prefix: string) => string;
  readonly providerId: string;
  readonly modelId: string;
  readonly pdfBuf: Buffer;
  readonly docxBuf: Buffer;
}): Promise<
  Result<{
    artifactIds: string[];
    pdfArtifactId: string;
    docxArtifactId: string;
  }>
> {
  const result = await ingestExportFiles({
    ...input,
    exportKind: "document",
    files: [
      { label: "pdf", mimeType: PDF_MIME, buffer: input.pdfBuf },
      { label: "docx", mimeType: DOCX_MIME, buffer: input.docxBuf },
    ],
  });
  if (!result.ok) return result;
  if (!result.value.pdfArtifactId || !result.value.docxArtifactId) {
    return failure(
      new ValidationError("Document export missing PDF or DOCX artifact")
    );
  }
  return success({
    artifactIds: result.value.artifactIds,
    pdfArtifactId: result.value.pdfArtifactId,
    docxArtifactId: result.value.docxArtifactId,
  });
}

export async function materializeDocumentExports(input: {
  readonly asyncMedia: AsyncMediaPlatform;
  readonly executionId: string;
  readonly organizationId: string;
  readonly exportKind: DocumentExportKind;
  readonly runtimeOutput?: Readonly<Record<string, unknown>>;
  readonly jobSummary?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly createId: (prefix: string) => string;
  readonly providerId?: string;
  readonly modelId?: string;
}): Promise<
  Result<{
    readonly artifactIds: readonly string[];
    readonly pdfArtifactId?: string;
    readonly pptxArtifactId?: string;
    readonly docxArtifactId?: string;
    readonly htmlArtifactId?: string;
    readonly plan: unknown;
  }>
> {
  const data = pickStructuredData(
    input.runtimeOutput,
    input.jobSummary,
    input.exportKind
  );
  if (data == null) {
    return failure(
      new ValidationError(
        input.exportKind === "presentation"
          ? "Structured output is not a valid PresentationPlan"
          : input.exportKind === "document"
            ? "Structured output is not a valid DocumentPlan"
            : "No structured plan available for document export"
      )
    );
  }

  if (input.exportKind === "document") {
    if (isPresentationShapedPayload(data) || isLaunchPlanShapedPayload(data)) {
      return failure(
        new ValidationError(
          "Document export rejected presentation-shaped or LaunchPlan payload"
        )
      );
    }
  }
  if (input.exportKind === "presentation" && !isPresentationShapedPayload(data)) {
    if (!parsePresentationPlan(data) && !parsePresentationRoutes(data)) {
      return failure(
        new ValidationError("Structured output is not a valid PresentationPlan")
      );
    }
  }

  const providerId = input.providerId ?? "provider.unagency";
  const modelId = input.modelId ?? "document-export";

  if (input.exportKind === "email") {
    const parsed = parseEmailPlan(data);
    if (!parsed) {
      return failure(
        new ValidationError("Structured output is not a valid EmailPlan")
      );
    }
    const files: Array<{
      label: ExportFileLabel;
      mimeType: string;
      buffer: Buffer;
    }> = [
      {
        label: "html",
        mimeType: HTML_MIME,
        buffer: Buffer.from(parsed.html, "utf8"),
      },
    ];
    if (parsed.textFallback.trim()) {
      files.push({
        label: "txt",
        mimeType: TEXT_MIME,
        buffer: Buffer.from(parsed.textFallback, "utf8"),
      });
    }
    const ingested = await ingestExportFiles({
      asyncMedia: input.asyncMedia,
      executionId: input.executionId,
      organizationId: input.organizationId,
      exportKind: "email",
      createId: input.createId,
      providerId,
      modelId,
      files,
    });
    if (!ingested.ok) return ingested;
    if (!ingested.value.htmlArtifactId) {
      return failure(
        new ValidationError("Email export missing HTML artifact")
      );
    }
    return success({
      artifactIds: ingested.value.artifactIds,
      htmlArtifactId: ingested.value.htmlArtifactId,
      plan: {
        ...parsed,
        exportKind: "email",
        htmlArtifactId: ingested.value.htmlArtifactId,
        downloadFormats: ["html"],
      },
    });
  }

  if (input.exportKind === "presentation") {
    const exportOptions = resolvePresentationExportOptions(input.metadata);
    const routes = parsePresentationRoutes(data);
    if (routes && routes.length > 0) {
      return materializePresentationRoutes({
        asyncMedia: input.asyncMedia,
        executionId: input.executionId,
        organizationId: input.organizationId,
        createId: input.createId,
        providerId,
        modelId,
        routes,
        exportOptions,
      });
    }

    const parsed = parsePresentationPlan(data);
    if (!parsed) {
      return failure(
        new ValidationError("Structured output is not a valid PresentationPlan")
      );
    }
    const pdfBuf = await buildPresentationPdf(parsed, exportOptions);
    const pptxBuf = await buildPresentationPptx(parsed, exportOptions);
    const pair = await ingestPresentationPair({
      asyncMedia: input.asyncMedia,
      executionId: input.executionId,
      organizationId: input.organizationId,
      createId: input.createId,
      providerId,
      modelId,
      pdfBuf,
      pptxBuf,
    });
    if (!pair.ok) return pair;
    return success({
      artifactIds: pair.value.artifactIds,
      pdfArtifactId: pair.value.pdfArtifactId,
      pptxArtifactId: pair.value.pptxArtifactId,
      plan: {
        ...parsed,
        pdfArtifactId: pair.value.pdfArtifactId,
        pptxArtifactId: pair.value.pptxArtifactId,
        downloadFormats: ["pdf", "pptx"],
      },
    });
  }

  let parsed =
    parseDocumentPlan(data) ||
    (data && typeof data === "object" && !Array.isArray(data)
      ? parseDocumentPlan(
          coerceTowardDocumentPlan(data as Record<string, unknown>) ?? undefined
        )
      : null);
  if (!parsed) {
    return failure(
      new ValidationError("Structured output is not a valid DocumentPlan")
    );
  }

  const meta = input.metadata ?? {};
  const userBrief =
    (typeof meta.userBrief === "string" && meta.userBrief.trim()) ||
    (typeof meta.websiteUserBrief === "string" &&
      meta.websiteUserBrief.trim()) ||
    "";
  const brandName =
    (typeof meta.brandName === "string" && meta.brandName.trim()) ||
    (typeof meta.requiredBrandName === "string" &&
      meta.requiredBrandName.trim()) ||
    (userBrief ? extractBrandNameFromMegaprompt(userBrief) : undefined) ||
    undefined;

  if (brandName) {
    const blob = JSON.stringify(parsed).toLowerCase();
    if (!blob.includes(brandName.toLowerCase())) {
      parsed = {
        ...parsed,
        title: parsed.title.toLowerCase().includes(brandName.toLowerCase())
          ? parsed.title
          : `${brandName} — ${parsed.title}`,
        summary: parsed.summary?.toLowerCase().includes(brandName.toLowerCase())
          ? parsed.summary
          : `${brandName}. ${parsed.summary ?? parsed.title}`,
      };
    }
  }

  const relevanceBrief = userBrief || parsed.summary || parsed.title;
  const relevance = validateDocumentPlanRelevance({
    data: parsed,
    userBrief: relevanceBrief,
    brandName,
  });
  if (
    !relevance.ok &&
    relevance.reasons.some(
      (r) =>
        r === "empty_document" ||
        r === "missing_brand_name" ||
        r === "low_brief_overlap"
    )
  ) {
    return failure(
      new ValidationError(
        `Document output was not grounded in the brief (${relevance.reasons.join(", ")})`
      )
    );
  }

  const service =
    typeof meta.service === "string" ? meta.service.trim().toLowerCase() : "";
  const subtype =
    typeof meta.subtype === "string" ? meta.subtype.trim().toLowerCase() : "";
  const isBrochure =
    service === "print" && (subtype === "brochures" || subtype === "leaflets");

  const brandColors: string[] = [];
  const pushColor = (v: unknown) => {
    if (typeof v === "string" && v.trim()) brandColors.push(v.trim());
    if (Array.isArray(v)) {
      for (const c of v) {
        if (typeof c === "string" && c.trim()) brandColors.push(c.trim());
      }
    }
  };
  pushColor(meta.brandColors);
  pushColor(meta.learnedBrandColors);

  const pdfBuf = isBrochure
    ? await buildBrochurePdf(parsed, {
        brandName,
        brandColors,
        subtype: subtype === "leaflets" ? "leaflets" : "brochures",
      })
    : await buildDocumentPdf(parsed);
  const docxBuf = await buildDocumentDocx(parsed);
  const pair = await ingestDocumentPair({
    asyncMedia: input.asyncMedia,
    executionId: input.executionId,
    organizationId: input.organizationId,
    createId: input.createId,
    providerId,
    modelId,
    pdfBuf,
    docxBuf,
  });
  if (!pair.ok) return pair;
  return success({
    artifactIds: pair.value.artifactIds,
    pdfArtifactId: pair.value.pdfArtifactId,
    docxArtifactId: pair.value.docxArtifactId,
    plan: {
      ...parsed,
      exportKind: "document",
      pdfArtifactId: pair.value.pdfArtifactId,
      docxArtifactId: pair.value.docxArtifactId,
      downloadFormats: ["pdf", "docx"],
      ...(isBrochure ? { layoutStyle: "brochure" } : {}),
    },
  });
}

async function materializePresentationRoutes(input: {
  readonly asyncMedia: AsyncMediaPlatform;
  readonly executionId: string;
  readonly organizationId: string;
  readonly createId: (prefix: string) => string;
  readonly providerId: string;
  readonly modelId: string;
  readonly routes: PresentationRoutePlan[];
  readonly exportOptions?: PresentationExportOptions;
}): Promise<
  Result<{
    readonly artifactIds: readonly string[];
    readonly pdfArtifactId?: string;
    readonly pptxArtifactId?: string;
    readonly docxArtifactId?: string;
    readonly plan: unknown;
  }>
> {
  const allArtifactIds: string[] = [];
  const enrichedRoutes: Array<Record<string, unknown>> = [];

  for (let i = 0; i < input.routes.length; i += 1) {
    const route = input.routes[i]!;
    const deck: PresentationPlan = route.deck;
    const pdfBuf = await buildPresentationPdf(deck, input.exportOptions);
    const pptxBuf = await buildPresentationPptx(deck, input.exportOptions);
    const pair = await ingestPresentationPair({
      asyncMedia: input.asyncMedia,
      executionId: input.executionId,
      organizationId: input.organizationId,
      createId: input.createId,
      providerId: input.providerId,
      modelId: input.modelId,
      pdfBuf,
      pptxBuf,
    });
    if (!pair.ok) return pair;
    allArtifactIds.push(...pair.value.artifactIds);
    enrichedRoutes.push({
      title: route.title,
      description: route.description,
      deckTitle: deck.title,
      deckSubtitle: deck.subtitle ?? "",
      slides: deck.slides,
      pdfArtifactId: pair.value.pdfArtifactId,
      pptxArtifactId: pair.value.pptxArtifactId,
      downloadFormats: ["pdf", "pptx"],
    });
  }

  const first = enrichedRoutes[0];
  return success({
    artifactIds: allArtifactIds,
    pdfArtifactId:
      typeof first?.pdfArtifactId === "string" ? first.pdfArtifactId : undefined,
    pptxArtifactId:
      typeof first?.pptxArtifactId === "string"
        ? first.pptxArtifactId
        : undefined,
    plan: {
      routes: enrichedRoutes,
      exportKind: "presentation",
      downloadFormats: ["pdf", "pptx"],
      title: first?.deckTitle,
      subtitle: first?.deckSubtitle,
      slides: first?.slides,
      pdfArtifactId: first?.pdfArtifactId,
      pptxArtifactId: first?.pptxArtifactId,
    },
  });
}

export function resolveDocumentExportKind(input: {
  outputKind?: string;
  mediaKind?: string;
  structuredName?: string;
  data?: unknown;
}): DocumentExportKind | null {
  const name = (input.structuredName ?? "").toLowerCase();
  const kind = (input.outputKind ?? "").toLowerCase();
  void input.mediaKind;
  const data = recoverExportStructuredData(input.data);

  // Requested deliverable identity wins — never infer a different type from shape.
  if (kind === "email" || name === "emailplan") {
    return parseEmailPlan(data) ? "email" : null;
  }

  if (kind === "document" || name === "documentplan") {
    if (isPresentationShapedPayload(data) || isLaunchPlanShapedPayload(data)) {
      return null;
    }
    if (parseDocumentPlan(data)) return "document";
    if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      coerceTowardDocumentPlan(data as Record<string, unknown>)
    ) {
      return "document";
    }
    return null;
  }

  if (
    kind === "presentation" ||
    name === "presentationplan" ||
    name === "presentationroutes" ||
    name === "presentationrouteconcepts"
  ) {
    if (parsePresentationRoutes(data) || parsePresentationPlan(data)) {
      return "presentation";
    }
    // Concepts-only / missing slides → null (caller hard-fails when required).
    return null;
  }

  // No explicit kind: only export when the payload is an unambiguous plan.
  if (parseEmailPlan(data)) return "email";
  if (parsePresentationRoutes(data) || parsePresentationPlan(data)) {
    return "presentation";
  }
  if (parseDocumentPlan(data)) return "document";
  return null;
}

/** Soft-skip only for non-required / ambiguous cases — required deliverables hard-fail. */
export function isSoftDocumentExportMiss(message: string | undefined): boolean {
  if (!message) return false;
  return /No structured plan available for document export|No document\/presentation export requested|Structured output is not a valid (DocumentPlan|EmailPlan)|Structured output is not a valid PresentationPlan|Document export rejected presentation-shaped|Document output was not grounded/i.test(
    message
  );
}

/** True when metadata requests a document/presentation that must produce artifacts. */
export function isRequiredDocumentOrPresentationExport(input: {
  outputKind?: string;
  structuredName?: string;
  service?: string;
  subtype?: string;
  deliverableRequired?: boolean;
}): boolean {
  if (input.deliverableRequired === true) return true;
  const kind = (input.outputKind ?? "").toLowerCase();
  const name = (input.structuredName ?? "").toLowerCase();
  const service = (input.service ?? "").toLowerCase();
  const subtype = (input.subtype ?? "").toLowerCase();
  if (kind === "document" || name === "documentplan") return true;
  if (
    kind === "presentation" ||
    name === "presentationplan" ||
    name === "presentationroutes" ||
    name === "presentationrouteconcepts"
  ) {
    return true;
  }
  if (service === "presentations" && subtype !== "gifs") return true;
  return false;
}
