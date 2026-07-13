import { IntelligenceError } from "../../shared/errors";

export class CapabilityCatalogError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "CAPABILITY_ERROR", metadata, cause });
    this.name = "CapabilityCatalogError";
  }
}
