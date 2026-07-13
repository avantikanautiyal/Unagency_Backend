import { IntelligenceError } from "../../shared/errors";

export class RuntimeError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, {
      code: "EXECUTION_ERROR",
      metadata,
      cause,
    });
    this.name = "RuntimeError";
  }
}
