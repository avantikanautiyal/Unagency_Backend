/**
 * Typed Artifact Engine errors (M3A).
 */

import { ValidationError } from "../../core/errors";
import type { CdfArtifactErrorCode } from "./types";

export class CdfArtifactError extends ValidationError {
  readonly artifactCode: CdfArtifactErrorCode;

  constructor(
    code: CdfArtifactErrorCode,
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    super(message, { artifactCode: code, ...metadata });
    this.name = "CdfArtifactError";
    this.artifactCode = code;
  }
}

export function artifactError(
  code: CdfArtifactErrorCode,
  message: string,
  metadata?: Record<string, unknown>,
): CdfArtifactError {
  return new CdfArtifactError(code, `[${code}] ${message}`, metadata);
}
