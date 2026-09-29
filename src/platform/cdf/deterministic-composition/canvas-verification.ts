/**
 * Generic technical canvas verification.
 * No platform/service-specific validators.
 */

import { PNG } from "pngjs";
import type { CompositionCanvasSpec } from "./types";

export type CanvasComplianceStatus =
  | "COMPLIANT"
  | "NON_COMPLIANT"
  | "UNVERIFIABLE";

export type CanvasVerificationResult = {
  readonly status: CanvasComplianceStatus;
  readonly criterion: "canvas_dimensions";
  readonly required: { readonly widthPx: number; readonly heightPx: number };
  readonly actual: {
    readonly widthPx?: number;
    readonly heightPx?: number;
    readonly mimeType?: string;
  };
  readonly evidence: string;
};

function readPngSize(
  bytes: Uint8Array | Buffer,
): { width: number; height: number } | undefined {
  try {
    const png = PNG.sync.read(Buffer.from(bytes));
    return { width: png.width, height: png.height };
  } catch {
    return undefined;
  }
}

/**
 * Compare actual raster dimensions against a generic canvas requirement.
 */
export function evaluateCanvasCompliance(input: {
  readonly required: Pick<CompositionCanvasSpec, "widthPx" | "heightPx">;
  readonly actual: {
    readonly widthPx?: number;
    readonly heightPx?: number;
    readonly mimeType?: string;
    readonly bytes?: Uint8Array | Buffer;
  };
}): CanvasVerificationResult {
  let width = input.actual.widthPx;
  let height = input.actual.heightPx;

  if (
    (width == null || height == null) &&
    input.actual.bytes &&
    input.actual.bytes.length > 0
  ) {
    const probed = readPngSize(input.actual.bytes);
    if (probed) {
      width = probed.width;
      height = probed.height;
    }
  }

  if (width == null || height == null) {
    return {
      status: "UNVERIFIABLE",
      criterion: "canvas_dimensions",
      required: {
        widthPx: input.required.widthPx,
        heightPx: input.required.heightPx,
      },
      actual: {
        widthPx: width,
        heightPx: height,
        mimeType: input.actual.mimeType,
      },
      evidence: "canvas dimensions unavailable for verification",
    };
  }

  const ok =
    width === input.required.widthPx && height === input.required.heightPx;
  const aspectRequired =
    input.required.widthPx / input.required.heightPx;
  const aspectActual = width / height;
  const aspectOk = Math.abs(aspectRequired - aspectActual) < 1e-9;

  if (!ok || !aspectOk) {
    return {
      status: "NON_COMPLIANT",
      criterion: "canvas_dimensions",
      required: {
        widthPx: input.required.widthPx,
        heightPx: input.required.heightPx,
      },
      actual: {
        widthPx: width,
        heightPx: height,
        mimeType: input.actual.mimeType,
      },
      evidence: `actual ${width}x${height} does not match required ${input.required.widthPx}x${input.required.heightPx}`,
    };
  }

  return {
    status: "COMPLIANT",
    criterion: "canvas_dimensions",
    required: {
      widthPx: input.required.widthPx,
      heightPx: input.required.heightPx,
    },
    actual: {
      widthPx: width,
      heightPx: height,
      mimeType: input.actual.mimeType,
    },
    evidence: `canvas ${width}x${height} matches requirement`,
  };
}
