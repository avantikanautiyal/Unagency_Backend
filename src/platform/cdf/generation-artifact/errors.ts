/**
 * Typed M3C generation→artifact errors.
 */

import { ValidationError } from "../../core/errors";
import type { CdfGenerationArtifactErrorCode } from "./types";

export class CdfGenerationArtifactError extends ValidationError {
  readonly generationArtifactCode: CdfGenerationArtifactErrorCode;

  constructor(
    code: CdfGenerationArtifactErrorCode,
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    super(`[${code}] ${message}`, {
      generationArtifactCode: code,
      ...metadata,
    });
    this.name = "CdfGenerationArtifactError";
    this.generationArtifactCode = code;
  }
}

export function generationArtifactError(
  code: CdfGenerationArtifactErrorCode,
  message: string,
  metadata?: Record<string, unknown>,
): CdfGenerationArtifactError {
  return new CdfGenerationArtifactError(code, message, metadata);
}
