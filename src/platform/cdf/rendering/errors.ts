/**
 * Typed renderer errors (M5).
 */

import { ValidationError } from "../../core/errors";
import type { CdfRenderErrorCode } from "./types";

export class CdfRenderError extends ValidationError {
  readonly renderCode: CdfRenderErrorCode;

  constructor(
    code: CdfRenderErrorCode,
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    super(message, { renderCode: code, ...metadata });
    this.name = "CdfRenderError";
    this.renderCode = code;
  }
}

export function renderError(
  code: CdfRenderErrorCode,
  message: string,
  metadata?: Record<string, unknown>,
): CdfRenderError {
  return new CdfRenderError(code, `[${code}] ${message}`, metadata);
}
