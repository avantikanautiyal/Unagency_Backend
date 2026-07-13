import { KernelError } from "../../../shared/errors";

export class HealthError extends KernelError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, metadata, cause);
    this.name = "HealthError";
  }
}
