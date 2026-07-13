import { IntelligenceError } from "../../shared/errors";

export class PolicyError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, {
      code: "INTELLIGENCE_ERROR",
      metadata,
      cause,
    });
    this.name = "PolicyError";
  }
}
