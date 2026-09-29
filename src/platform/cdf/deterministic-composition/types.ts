/**
 * Generic deterministic communication composition boundary.
 *
 * VisualGenerationResult + CommunicationCompositionInput + contract
 * → ComposedDeliverable
 *
 * No service / platform / provider / phase semantic branches.
 */

import type {
  DeliverableCompositionContract,
  DeliverableElementId,
  DeliverableElementRealization,
} from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";

export type CompositionPixelBounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type CompositionSafeArea = {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
};

export type CompositionCanvasSpec = {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly aspectRatio: string;
  readonly colourSpace?: string;
  readonly preferredMimeType?: "image/png" | "image/jpeg";
  readonly safeArea: CompositionSafeArea;
};

export type VisualGenerationResult = {
  readonly bytes: Uint8Array | Buffer;
  readonly mimeType: "image/png" | "image/jpeg" | string;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly provenance: "generated" | "fixture" | "diagnostic";
  /** Opaque diagnostic metadata — compositor must not branch on it. */
  readonly generationMeta?: Readonly<Record<string, unknown>>;
};

export type CompositionBrandMarkInput = {
  readonly bytes: Uint8Array | Buffer;
  readonly mimeType: "image/png" | "image/jpeg" | string;
  readonly assetId?: string;
  readonly provenance: string;
};

export type CompositionTypography = {
  readonly fontFamily: string;
  readonly maxFontSizePx: number;
  readonly minFontSizePx: number;
  readonly lineHeightRatio: number;
  readonly align: "left" | "center" | "right";
  readonly colorRgb: readonly [number, number, number];
};

export type CommunicationCompositionInput = {
  readonly contract: DeliverableCompositionContract;
  readonly visual: VisualGenerationResult;
  readonly canvas: CompositionCanvasSpec;
  readonly primaryMessage?: string;
  readonly supportingMessage?: string;
  readonly cta?: string;
  readonly brandMark?: CompositionBrandMarkInput;
  readonly typography?: CompositionTypography;
  readonly brandContext?: Readonly<Record<string, unknown>>;
  readonly provenance?: Readonly<Record<string, unknown>>;
};

export type CompositionLayerEvidence = {
  readonly element: DeliverableElementId | string;
  readonly realization: DeliverableElementRealization;
  readonly required: boolean;
  readonly rendered: boolean;
  readonly layerRole: string;
  readonly source: string;
  readonly sourceProvenance?: string;
  readonly bounds?: CompositionPixelBounds;
  readonly text?: string;
  readonly textHash?: string;
  readonly insideSafeArea?: boolean;
  readonly notes?: string;
};

export type CompositionFailureCode =
  | "MISSING_REQUIRED_DETERMINISTIC_VALUE"
  | "TEXT_OVERFLOW"
  | "INVALID_VISUAL"
  | "INVALID_BRAND_MARK"
  | "INVALID_CANVAS"
  | "COMPOSITION_FAILED";

export type CompositionFailure = {
  readonly ok: false;
  readonly code: CompositionFailureCode;
  readonly message: string;
  readonly element?: string;
};

export type ComposedDeliverable = {
  readonly ok: true;
  readonly bytes: Buffer;
  readonly mimeType: "image/png";
  readonly widthPx: number;
  readonly heightPx: number;
  readonly layers: readonly CompositionLayerEvidence[];
  /** SHA-256 of final raster bytes. */
  readonly contentHash: string;
  /** Hash of source visual plate bytes — proves final ≠ raw plate when composition ran. */
  readonly sourceVisualHash: string;
  readonly canvas: CompositionCanvasSpec;
  readonly isFinalComposedDeliverable: true;
  readonly rawVisualIsNotAcceptanceSubject: true;
};

export type ComposeDeliverableResult = ComposedDeliverable | CompositionFailure;

export type CanvasVerificationInput = {
  readonly required: CompositionCanvasSpec;
  readonly actual: {
    readonly widthPx?: number;
    readonly heightPx?: number;
    readonly mimeType?: string;
    readonly bytes?: Uint8Array | Buffer;
  };
};
