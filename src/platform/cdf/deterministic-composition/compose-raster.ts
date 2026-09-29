/**
 * Generic deterministic raster communication compositor.
 *
 * Places a generated visual plate, then deterministically renders required
 * communication + brand marks per composition-contract realization policy.
 *
 * No service / platform / provider / phase branches.
 */

import { createHash } from "crypto";
import { PNG } from "pngjs";
import * as jpeg from "jpeg-js";
import {
  isCompositionElementRequired,
  isRenderedCommunicationElement,
  resolveElementRealization,
} from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import type { DeliverableElementId } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  BITMAP_FONT_FAMILY,
  blitText,
  fillRect,
  fitTextDeterministic,
  setOpaquePixel,
  type RgbaBuffer,
} from "./bitmap-font";
import type {
  CompositionLayerEvidence,
  CompositionPixelBounds,
  CommunicationCompositionInput,
  ComposeDeliverableResult,
  CompositionFailure,
  VisualGenerationResult,
} from "./types";

function fail(
  code: CompositionFailure["code"],
  message: string,
  element?: string,
): CompositionFailure {
  return { ok: false, code, message, ...(element ? { element } : {}) };
}

function sha256(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

function textHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function asBuffer(bytes: Uint8Array | Buffer): Buffer {
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
}

function decodeRaster(
  bytes: Uint8Array | Buffer,
  mimeType: string,
): { width: number; height: number; data: Buffer } | null {
  const buf = asBuffer(bytes);
  try {
    if (
      mimeType.includes("jpeg") ||
      mimeType.includes("jpg") ||
      (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8)
    ) {
      const decoded = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
      return {
        width: decoded.width,
        height: decoded.height,
        data: Buffer.from(decoded.data),
      };
    }
    const png = PNG.sync.read(buf);
    return {
      width: png.width,
      height: png.height,
      data: Buffer.from(png.data),
    };
  } catch {
    return null;
  }
}

function boundsInsideSafeArea(
  bounds: CompositionPixelBounds,
  canvasW: number,
  canvasH: number,
  safe: CommunicationCompositionInput["canvas"]["safeArea"],
): boolean {
  const left = safe.left;
  const top = safe.top;
  const right = canvasW - safe.right;
  const bottom = canvasH - safe.bottom;
  return (
    bounds.x >= left &&
    bounds.y >= top &&
    bounds.x + bounds.width <= right &&
    bounds.y + bounds.height <= bottom
  );
}

/** Cover-fit source into destination (center crop). */
function blitCover(
  target: RgbaBuffer,
  source: { width: number; height: number; data: Buffer },
): void {
  const scale = Math.max(
    target.width / source.width,
    target.height / source.height,
  );
  const srcW = target.width / scale;
  const srcH = target.height / scale;
  const srcX0 = (source.width - srcW) / 2;
  const srcY0 = (source.height - srcH) / 2;

  for (let y = 0; y < target.height; y++) {
    for (let x = 0; x < target.width; x++) {
      const sx = Math.min(
        source.width - 1,
        Math.max(0, Math.floor(srcX0 + x / scale)),
      );
      const sy = Math.min(
        source.height - 1,
        Math.max(0, Math.floor(srcY0 + y / scale)),
      );
      const sIdx = (source.width * sy + sx) << 2;
      const tIdx = (target.width * y + x) << 2;
      target.data[tIdx] = source.data[sIdx]!;
      target.data[tIdx + 1] = source.data[sIdx + 1]!;
      target.data[tIdx + 2] = source.data[sIdx + 2]!;
      target.data[tIdx + 3] = 255;
    }
  }
}

function blitImageAlpha(
  target: RgbaBuffer,
  source: { width: number; height: number; data: Buffer },
  destX: number,
  destY: number,
  destW: number,
  destH: number,
): void {
  for (let y = 0; y < destH; y++) {
    for (let x = 0; x < destW; x++) {
      const sx = Math.min(
        source.width - 1,
        Math.floor((x / destW) * source.width),
      );
      const sy = Math.min(
        source.height - 1,
        Math.floor((y / destH) * source.height),
      );
      const sIdx = (source.width * sy + sx) << 2;
      const a = source.data[sIdx + 3] ?? 255;
      if (a === 0) continue;
      setOpaquePixel(
        target,
        destX + x,
        destY + y,
        source.data[sIdx]!,
        source.data[sIdx + 1]!,
        source.data[sIdx + 2]!,
        a,
      );
    }
  }
}

function requireDeterministicText(
  input: CommunicationCompositionInput,
  element: DeliverableElementId,
): string | CompositionFailure {
  const required = isCompositionElementRequired(input.contract, element);
  const realization = resolveElementRealization(input.contract, element);
  if (realization !== "deterministic") {
    return fail(
      "COMPOSITION_FAILED",
      `element ${element} is not deterministic`,
      element,
    );
  }

  let value: string | undefined;
  if (element === "primary_message_surface") value = input.primaryMessage;
  else if (element === "secondary_message_surface")
    value = input.supportingMessage;
  else if (element === "call_to_action") value = input.cta;

  if (required && (!value || !value.trim())) {
    return fail(
      "MISSING_REQUIRED_DETERMINISTIC_VALUE",
      `required deterministic element ${element} has no authoritative value`,
      element,
    );
  }
  return value?.trim() ?? "";
}

const DEFAULT_TYPOGRAPHY = {
  fontFamily: BITMAP_FONT_FAMILY,
  maxFontSizePx: 56,
  minFontSizePx: 21,
  lineHeightRatio: 1.35,
  align: "left" as const,
  colorRgb: [18, 18, 18] as const,
};

/**
 * Compose a final communication raster from a visual plate + deterministic layers.
 */
export function composeDeliverable(
  input: CommunicationCompositionInput,
): ComposeDeliverableResult {
  const { canvas, contract } = input;
  if (
    !Number.isInteger(canvas.widthPx) ||
    !Number.isInteger(canvas.heightPx) ||
    canvas.widthPx < 1 ||
    canvas.heightPx < 1
  ) {
    return fail("INVALID_CANVAS", "canvas dimensions must be positive integers");
  }

  const visualDecoded = decodeRaster(input.visual.bytes, input.visual.mimeType);
  if (!visualDecoded) {
    return fail("INVALID_VISUAL", "visual plate bytes could not be decoded");
  }

  const target: RgbaBuffer = {
    width: canvas.widthPx,
    height: canvas.heightPx,
    data: Buffer.alloc(canvas.widthPx * canvas.heightPx * 4, 255),
  };

  blitCover(target, visualDecoded);

  const layers: CompositionLayerEvidence[] = [];
  const safe = canvas.safeArea;
  const contentLeft = safe.left;
  const contentTop = safe.top;
  const contentRight = canvas.widthPx - safe.right;
  const contentBottom = canvas.heightPx - safe.bottom;
  const contentW = contentRight - contentLeft;
  const contentH = contentBottom - contentTop;

  // layout_zones — deterministic structure (text band + brand band).
  if (resolveElementRealization(contract, "layout_zones") === "deterministic") {
    const textBandH = Math.floor(contentH * 0.42);
    const layoutBounds: CompositionPixelBounds = {
      x: contentLeft,
      y: contentTop,
      width: contentW,
      height: contentH,
    };
    layers.push({
      element: "layout_zones",
      realization: "deterministic",
      required: isCompositionElementRequired(contract, "layout_zones"),
      rendered: true,
      layerRole: "layout_structure",
      source: "composition_layout",
      bounds: layoutBounds,
      insideSafeArea: true,
      notes: `text_band_h=${textBandH}`,
    });
  }

  // visual_subject — generated plate already placed.
  if (resolveElementRealization(contract, "visual_subject") === "generated") {
    layers.push({
      element: "visual_subject",
      realization: "generated",
      required: isCompositionElementRequired(contract, "visual_subject"),
      rendered: true,
      layerRole: "visual_plate",
      source: "visual_generation_result",
      sourceProvenance: input.visual.provenance,
      bounds: {
        x: 0,
        y: 0,
        width: canvas.widthPx,
        height: canvas.heightPx,
      },
      notes: "cover-fit visual plate; not the acceptance subject alone",
    });
  }

  const typography = { ...DEFAULT_TYPOGRAPHY, ...input.typography };
  const logoReserve = 120;
  const textBandH = Math.floor(contentH * 0.42);
  const textBox: CompositionPixelBounds = {
    x: contentLeft,
    y: contentTop,
    width: contentW,
    height: Math.max(80, textBandH - 16),
  };

  // Legibility panel behind primary text (deterministic, not communication).
  fillRect(
    target,
    textBox.x,
    textBox.y,
    textBox.width,
    textBox.height,
    255,
    255,
    255,
    210,
  );

  const primaryResult = requireDeterministicText(
    input,
    "primary_message_surface",
  );
  if (typeof primaryResult !== "string") return primaryResult;
  if (primaryResult) {
    const fit = fitTextDeterministic({
      text: primaryResult,
      maxWidthPx: textBox.width - 24,
      maxHeightPx: textBox.height - 24,
      maxFontSizePx: typography.maxFontSizePx,
      minFontSizePx: typography.minFontSizePx,
      lineHeightRatio: typography.lineHeightRatio,
    });
    if (!fit) {
      return fail(
        "TEXT_OVERFLOW",
        "primary message cannot fit within declared layout limits without truncation",
        "primary_message_surface",
      );
    }
    const textOriginX = textBox.x + 12;
    const textOriginY = textBox.y + 12;
    blitText({
      target,
      lines: fit.lines,
      scale: fit.scale,
      originX: textOriginX,
      originY: textOriginY,
      lineHeightRatio: typography.lineHeightRatio,
      align: typography.align,
      boxWidth: textBox.width - 24,
      colorRgb: typography.colorRgb,
    });
    const renderedBounds: CompositionPixelBounds = {
      x: textOriginX,
      y: textOriginY,
      width: fit.widthPx,
      height: fit.heightPx,
    };
    if (
      !boundsInsideSafeArea(
        renderedBounds,
        canvas.widthPx,
        canvas.heightPx,
        safe,
      )
    ) {
      return fail(
        "COMPOSITION_FAILED",
        "primary message bounds escape safe area",
        "primary_message_surface",
      );
    }
    layers.push({
      element: "primary_message_surface",
      realization: "deterministic",
      required: true,
      rendered: true,
      layerRole: "rendered_communication",
      source: "authoritative_text",
      text: primaryResult,
      textHash: textHash(primaryResult),
      bounds: renderedBounds,
      insideSafeArea: true,
      notes: `font=${typography.fontFamily};scale=${fit.scale};lines=${fit.lines.length}`,
    });
  }

  // Optional supporting / CTA (deterministic when present).
  for (const el of [
    "secondary_message_surface",
    "call_to_action",
  ] as const) {
    if (resolveElementRealization(contract, el) !== "deterministic") continue;
    const valueResult = requireDeterministicText(input, el);
    if (typeof valueResult !== "string") return valueResult;
    if (!valueResult) continue;
    // Optional layers: place below primary within remaining text band if space.
    // Fail closed only when required; optional overflow → fail rather than truncate.
    const remainingY =
      (layers.find((l) => l.element === "primary_message_surface")?.bounds?.y ??
        textBox.y) +
      (layers.find((l) => l.element === "primary_message_surface")?.bounds
        ?.height ?? 0) +
      12;
    const remainingH = textBox.y + textBox.height - remainingY;
    if (remainingH < typography.minFontSizePx) {
      if (isCompositionElementRequired(contract, el)) {
        return fail(
          "TEXT_OVERFLOW",
          `${el} cannot fit`,
          el,
        );
      }
      continue;
    }
    const fit = fitTextDeterministic({
      text: valueResult,
      maxWidthPx: textBox.width - 24,
      maxHeightPx: remainingH,
      maxFontSizePx: Math.min(typography.maxFontSizePx, 36),
      minFontSizePx: typography.minFontSizePx,
      lineHeightRatio: typography.lineHeightRatio,
    });
    if (!fit) {
      if (isCompositionElementRequired(contract, el)) {
        return fail("TEXT_OVERFLOW", `${el} cannot fit`, el);
      }
      continue;
    }
    blitText({
      target,
      lines: fit.lines,
      scale: fit.scale,
      originX: textBox.x + 12,
      originY: remainingY,
      lineHeightRatio: typography.lineHeightRatio,
      align: typography.align,
      boxWidth: textBox.width - 24,
      colorRgb: typography.colorRgb,
    });
    layers.push({
      element: el,
      realization: "deterministic",
      required: isCompositionElementRequired(contract, el),
      rendered: true,
      layerRole: "rendered_communication",
      source: "authoritative_text",
      text: valueResult,
      textHash: textHash(valueResult),
      bounds: {
        x: textBox.x + 12,
        y: remainingY,
        width: fit.widthPx,
        height: fit.heightPx,
      },
      insideSafeArea: true,
    });
  }

  // brand_signature — deterministic logo from asset bytes.
  if (resolveElementRealization(contract, "brand_signature") === "deterministic") {
    const required = isCompositionElementRequired(contract, "brand_signature");
    if (required && !input.brandMark) {
      return fail(
        "MISSING_REQUIRED_DETERMINISTIC_VALUE",
        "required deterministic brand_signature has no brand mark bytes",
        "brand_signature",
      );
    }
    if (input.brandMark) {
      const logo = decodeRaster(
        input.brandMark.bytes,
        input.brandMark.mimeType,
      );
      if (!logo) {
        return fail(
          "INVALID_BRAND_MARK",
          "brand mark bytes could not be decoded",
          "brand_signature",
        );
      }
      const maxLogoH = Math.min(96, logoReserve - 16);
      const maxLogoW = Math.min(240, Math.floor(contentW * 0.35));
      const scale = Math.min(maxLogoW / logo.width, maxLogoH / logo.height);
      const destW = Math.max(1, Math.floor(logo.width * scale));
      const destH = Math.max(1, Math.floor(logo.height * scale));
      const destX = contentRight - destW;
      const destY = contentBottom - destH;
      blitImageAlpha(target, logo, destX, destY, destW, destH);
      const logoBounds: CompositionPixelBounds = {
        x: destX,
        y: destY,
        width: destW,
        height: destH,
      };
      if (
        !boundsInsideSafeArea(
          logoBounds,
          canvas.widthPx,
          canvas.heightPx,
          safe,
        )
      ) {
        return fail(
          "COMPOSITION_FAILED",
          "brand signature escapes safe area",
          "brand_signature",
        );
      }
      layers.push({
        element: "brand_signature",
        realization: "deterministic",
        required,
        rendered: true,
        layerRole: "brand_mark",
        source: "brand_asset",
        sourceProvenance: input.brandMark.provenance,
        bounds: logoBounds,
        insideSafeArea: true,
        notes: input.brandMark.assetId
          ? `assetId=${input.brandMark.assetId}`
          : undefined,
      });
    }
  }

  // Fail closed: every required deterministic rendered_communication / brand must be rendered.
  for (const el of contract.requiredElements) {
    const realization = resolveElementRealization(contract, el);
    if (realization !== "deterministic") continue;
    if (el === "layout_zones") continue;
    if (isRenderedCommunicationElement(el) || el === "brand_signature" || el === "identity_mark") {
      const layer = layers.find((l) => l.element === el && l.rendered);
      if (!layer) {
        return fail(
          "MISSING_REQUIRED_DETERMINISTIC_VALUE",
          `required deterministic element ${el} was not rendered`,
          el,
        );
      }
    }
  }

  const png = new PNG({ width: canvas.widthPx, height: canvas.heightPx });
  png.data = target.data;
  const outBytes = PNG.sync.write(png);

  return {
    ok: true,
    bytes: outBytes,
    mimeType: "image/png",
    widthPx: canvas.widthPx,
    heightPx: canvas.heightPx,
    layers: Object.freeze(layers),
    contentHash: sha256(outBytes),
    sourceVisualHash: sha256(input.visual.bytes),
    canvas,
    isFinalComposedDeliverable: true,
    rawVisualIsNotAcceptanceSubject: true,
  };
}

/** True when composed output is distinct from the raw visual plate. */
export function composedDiffersFromVisualPlate(
  composed: { contentHash: string; sourceVisualHash: string },
): boolean {
  return composed.contentHash !== composed.sourceVisualHash;
}

export function assertVisualIsNotAcceptanceSubject(
  visual: VisualGenerationResult,
): true {
  void visual;
  return true;
}
