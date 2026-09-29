/**
 * Typed refinement errors (M6).
 */

import { ValidationError } from "../../core/errors";
import type { CdfRefinementErrorCode } from "./types";

export class CdfRefinementError extends ValidationError {
  readonly refinementCode: CdfRefinementErrorCode;

  constructor(
    code: CdfRefinementErrorCode,
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    super(message, { refinementCode: code, ...metadata });
    this.name = "CdfRefinementError";
    this.refinementCode = code;
  }
}

export function refinementError(
  code: CdfRefinementErrorCode,
  message: string,
  metadata?: Record<string, unknown>,
): CdfRefinementError {
  return new CdfRefinementError(code, `[${code}] ${message}`, metadata);
}
