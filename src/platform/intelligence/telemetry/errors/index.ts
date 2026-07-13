import { IntelligenceError } from "../../shared/errors";

export class TelemetryError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "TELEMETRY_ERROR", metadata, cause });
    this.name = "TelemetryError";
  }
}
