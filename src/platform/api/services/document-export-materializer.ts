/**
 * After structured PresentationPlan / PresentationRoutes / DocumentPlan,
 * materialize downloadable PPTX + PDF artifacts for in-app preview / download.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import type { AsyncMediaPlatform } from "../../infrastructure/durability/create-async-media-platform";
import {
  buildDocumentPdf,
  buildDocumentPptx,
  buildPresentationPdf,
  buildPresentationPptx,
  parseDocumentPlan,
  parsePresentationPlan,
  parsePresentationRoutes,
  type PresentationPlan,
  type PresentationRoutePlan,
} from "../../os/delivery/document-export-service";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const PDF_MIME = "application/pdf";

export type DocumentExportKind = "presentation" | "document";

function pickStructuredData(
  runtimeOutput: Readonly<Record<string, unknown>> | undefined,
  jobSummary: Readonly<Record<string, unknown>> | undefined
): unknown {
  return (
    jobSummary?.structuredData ??
    runtimeOutput?.structured ??
    runtimeOutput?.structuredOutput ??
    (runtimeOutput?.data != null && typeof runtimeOutput.data === "object"
      ? runtimeOutput.data
      : undefined)
  );
}

async function ingestPair(input: {
  readonly asyncMedia: AsyncMediaPlatform;
  readonly executionId: string;
  readonly organizationId: string;
  readonly exportKind: DocumentExportKind;
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
  const operationId = input.createId("docexport");
  const capabilityId =
    input.exportKind === "presentation"
      ? "output.presentation"
      : "output.document";

  const files: Array<{
    label: "pdf" | "pptx";
    mimeType: string;
    buffer: Buffer;
  }> = [
    { label: "pdf", mimeType: PDF_MIME, buffer: input.pdfBuf },
    { label: "pptx", mimeType: PPTX_MIME, buffer: input.pptxBuf },
  ];

  const artifactIds: string[] = [];
  let pdfArtifactId = "";
  let pptxArtifactId = "";

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]!;
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
  }

  return success({ artifactIds, pdfArtifactId, pptxArtifactId });
}

export async function materializeDocumentExports(input: {
  readonly asyncMedia: AsyncMediaPlatform;
  readonly executionId: string;
  readonly organizationId: string;
  readonly exportKind: DocumentExportKind;
  readonly runtimeOutput?: Readonly<Record<string, unknown>>;
  readonly jobSummary?: Readonly<Record<string, unknown>>;
  readonly createId: (prefix: string) => string;
  readonly providerId?: string;
  readonly modelId?: string;
}): Promise<
  Result<{
    readonly artifactIds: readonly string[];
    readonly pdfArtifactId?: string;
    readonly pptxArtifactId?: string;
    readonly plan: unknown;
  }>
> {
  const data = pickStructuredData(input.runtimeOutput, input.jobSummary);
  if (data == null) {
    return failure(
      new ValidationError("No structured plan available for document export")
    );
  }

  const providerId = input.providerId ?? "provider.unagency";
  const modelId = input.modelId ?? "document-export";

  if (input.exportKind === "presentation") {
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
      });
    }

    const parsed = parsePresentationPlan(data);
    if (!parsed) {
      return failure(
        new ValidationError("Structured output is not a valid PresentationPlan")
      );
    }
    const pdfBuf = await buildPresentationPdf(parsed);
    const pptxBuf = await buildPresentationPptx(parsed);
    const pair = await ingestPair({
      asyncMedia: input.asyncMedia,
      executionId: input.executionId,
      organizationId: input.organizationId,
      exportKind: "presentation",
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
      },
    });
  }

  const parsed = parseDocumentPlan(data);
  if (!parsed) {
    const asPresentation = parsePresentationPlan(data);
    if (!asPresentation) {
      return failure(
        new ValidationError("Structured output is not a valid DocumentPlan")
      );
    }
    const pdfBuf = await buildPresentationPdf(asPresentation);
    const pptxBuf = await buildPresentationPptx(asPresentation);
    const pair = await ingestPair({
      asyncMedia: input.asyncMedia,
      executionId: input.executionId,
      organizationId: input.organizationId,
      exportKind: "presentation",
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
        ...asPresentation,
        pdfArtifactId: pair.value.pdfArtifactId,
        pptxArtifactId: pair.value.pptxArtifactId,
      },
    });
  }

  const pdfBuf = await buildDocumentPdf(parsed);
  const pptxBuf = await buildDocumentPptx(parsed);
  const pair = await ingestPair({
    asyncMedia: input.asyncMedia,
    executionId: input.executionId,
    organizationId: input.organizationId,
    exportKind: input.exportKind,
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
}): Promise<
  Result<{
    readonly artifactIds: readonly string[];
    readonly pdfArtifactId?: string;
    readonly pptxArtifactId?: string;
    readonly plan: unknown;
  }>
> {
  const allArtifactIds: string[] = [];
  const enrichedRoutes: Array<Record<string, unknown>> = [];

  for (let i = 0; i < input.routes.length; i += 1) {
    const route = input.routes[i]!;
    const deck: PresentationPlan = route.deck;
    const pdfBuf = await buildPresentationPdf(deck);
    const pptxBuf = await buildPresentationPptx(deck);
    const pair = await ingestPair({
      asyncMedia: input.asyncMedia,
      executionId: input.executionId,
      organizationId: input.organizationId,
      exportKind: "presentation",
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
  const kind = (input.outputKind ?? "").toLowerCase();
  const media = (input.mediaKind ?? "").toLowerCase();
  const name = (input.structuredName ?? "").toLowerCase();

  if (
    kind === "document" ||
    media === "document" ||
    name === "documentplan"
  ) {
    return "document";
  }
  if (
    kind === "presentation" ||
    media === "presentation" ||
    name === "presentationplan" ||
    name === "presentationroutes"
  ) {
    return "presentation";
  }
  if (parsePresentationRoutes(input.data) || parsePresentationPlan(input.data)) {
    return "presentation";
  }
  if (parseDocumentPlan(input.data)) return "document";
  return null;
}
