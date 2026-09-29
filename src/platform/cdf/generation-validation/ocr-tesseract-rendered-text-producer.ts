/**
 * Production OCR producer — tesseract.js over VaultAssetResolver bytes.
 *
 * Generic: no serviceId / phaseId / platform / provider semantic branches.
 * Returns evidence only — never COMPLIANT/NON_COMPLIANT decisions.
 */

import type { VaultAssetResolver } from "../rendering/asset-resolver";
import { getDefaultVaultAssetResolver } from "../rendering/default-vault-asset-resolver";
import type {
  RenderedTextProof,
  RenderedTextProofProducer,
} from "./rendered-text-proof";
import { logCdfAssetByteLifecycle } from "../diagnostics/asset-byte-lifecycle-log";

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024; // 20 MiB
const DEFAULT_TIMEOUT_MS = 45_000;

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/bmp",
]);

export type TesseractRenderedTextProducerOptions = {
  readonly resolveBytes?: VaultAssetResolver["resolve"];
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
  readonly language?: string;
};

function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.byteLength < 12) return null;
  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  // WEBP (RIFF....WEBP)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // BMP
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`ocr_timeout_${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Create a production RenderedTextProofProducer using tesseract.js.
 * Resolves image bytes only via VaultAssetResolver (no arbitrary URL fetch).
 */
export function createTesseractRenderedTextProofProducer(
  options: TesseractRenderedTextProducerOptions = {},
): RenderedTextProofProducer {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const language = options.language ?? "eng";

  return async (input): Promise<RenderedTextProof | null> => {
    const vaultAssetId = input.artifactRef?.vaultAssetId?.trim();
    const tenantScope = {
      organizationId: input.artifactRef?.organizationId ?? null,
      projectId: input.artifactRef?.projectId ?? null,
    };
    logCdfAssetByteLifecycle({
      boundary: "ocr_producer.enter",
      vaultAssetId: vaultAssetId ?? null,
      previewAssetRef: vaultAssetId ?? null,
      tenantScope,
      mimeType: input.artifactRef?.mimeType ?? null,
      referenceExists: Boolean(vaultAssetId),
      referenceResolves: false,
      bytesExist: false,
    });
    if (!vaultAssetId) {
      logCdfAssetByteLifecycle({
        boundary: "ocr_producer.missing_vault_asset_id",
        vaultAssetId: null,
        previewAssetRef: null,
        tenantScope,
        referenceExists: false,
        referenceResolves: false,
        bytesExist: false,
        resolverResult: "missing_vault_asset_id",
      });
      return {
        extractedText: null,
        source: "ocr",
        outcome: "artifact_unavailable",
        failureReason: "missing_vault_asset_id",
      };
    }

    const resolve =
      options.resolveBytes ??
      ((args: {
        vaultAssetId: string;
        organizationId?: string;
        projectId?: string;
      }) => {
        const resolver = getDefaultVaultAssetResolver();
        if (!resolver) return Promise.resolve(undefined);
        return resolver.resolve(args);
      });

    let bytes: Uint8Array | undefined;
    try {
      bytes = await resolve({
        vaultAssetId,
        organizationId: input.artifactRef?.organizationId,
        projectId: input.artifactRef?.projectId,
      });
    } catch (err) {
      logCdfAssetByteLifecycle({
        boundary: "ocr_producer.resolve_threw",
        vaultAssetId,
        previewAssetRef: vaultAssetId,
        tenantScope,
        referenceExists: true,
        referenceResolves: false,
        bytesExist: false,
        resolverResult:
          err instanceof Error
            ? `resolve_failed:${err.message.slice(0, 120)}`
            : "resolve_failed",
      });
      return {
        extractedText: null,
        source: "ocr",
        outcome: "error",
        failureReason:
          err instanceof Error
            ? `resolve_failed:${err.message.slice(0, 120)}`
            : "resolve_failed",
      };
    }

    if (!bytes || bytes.byteLength === 0) {
      logCdfAssetByteLifecycle({
        boundary: "ocr_producer.vault_bytes_missing",
        vaultAssetId,
        previewAssetRef: vaultAssetId,
        tenantScope,
        mimeType: input.artifactRef?.mimeType ?? null,
        byteLength: 0,
        referenceExists: true,
        referenceResolves: false,
        bytesExist: false,
        resolverResult: "vault_bytes_missing",
      });
      return {
        extractedText: null,
        source: "ocr",
        outcome: "artifact_unavailable",
        failureReason: "vault_bytes_missing",
      };
    }

    logCdfAssetByteLifecycle({
      boundary: "ocr_producer.bytes_resolved",
      vaultAssetId,
      previewAssetRef: vaultAssetId,
      tenantScope,
      mimeType: input.artifactRef?.mimeType ?? null,
      byteLength: bytes.byteLength,
      referenceExists: true,
      referenceResolves: true,
      bytesExist: true,
      resolverResult: "ok",
    });

    if (bytes.byteLength > maxBytes) {
      return {
        extractedText: null,
        source: "ocr",
        outcome: "error",
        failureReason: `image_too_large_${bytes.byteLength}`,
      };
    }

    const sniffed = sniffImageMime(bytes);
    const declared = input.artifactRef?.mimeType?.toLowerCase() ?? null;
    const mime = sniffed ?? declared;
    if (mime && !ALLOWED_MIME.has(mime)) {
      return {
        extractedText: null,
        source: "ocr",
        outcome: "error",
        failureReason: `unsupported_mime_${mime}`,
      };
    }
    if (!mime) {
      return {
        extractedText: null,
        source: "ocr",
        outcome: "error",
        failureReason: "unrecognized_image_bytes",
      };
    }

    try {
      // Dynamic import keeps unit tests that never OCR from loading workers eagerly
      // when a different producer is installed.
      const Tesseract = await import("tesseract.js");
      const buffer = Buffer.from(bytes);
      const result = await withTimeout(
        Tesseract.recognize(buffer, language, {
          logger: () => undefined,
        }),
        timeoutMs,
      );
      const text =
        typeof result?.data?.text === "string" ? result.data.text : "";
      const confRaw = result?.data?.confidence;
      const confidence =
        typeof confRaw === "number" && Number.isFinite(confRaw)
          ? Math.max(0, Math.min(1, confRaw / 100))
          : undefined;

      return {
        extractedText: text,
        source: "ocr",
        outcome: "ok",
        language,
        ...(confidence !== undefined ? { confidence } : {}),
      };
    } catch (err) {
      return {
        extractedText: null,
        source: "ocr",
        outcome: "error",
        failureReason:
          err instanceof Error
            ? err.message.slice(0, 200)
            : "tesseract_recognize_failed",
      };
    }
  };
}
