import { IntelligenceError } from "../../shared/errors";

export class ProviderCapabilityMatrixError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "PROVIDER_ERROR", metadata, cause });
    this.name = "ProviderCapabilityMatrixError";
  }
}
