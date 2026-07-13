import { IntelligenceError } from "../../shared/errors";

export class GatewayError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "INTELLIGENCE_ERROR", metadata, cause });
    this.name = "GatewayError";
  }
}

export class GatewayValidationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "VALIDATION_ERROR", metadata, cause });
    this.name = "GatewayValidationError";
  }
}
