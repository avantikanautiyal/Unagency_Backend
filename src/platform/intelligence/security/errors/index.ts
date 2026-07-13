import { IntelligenceError } from "../../shared/errors";

export class SecurityModuleError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "SECURITY_ERROR", metadata, cause });
    this.name = "SecurityModuleError";
  }
}
