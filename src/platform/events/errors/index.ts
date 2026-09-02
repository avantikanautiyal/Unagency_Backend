import { IntelligenceError } from "../../core/errors";

export class EventError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "EVENT_ERROR", metadata, cause });
    this.name = "EventError";
  }
}
