import { randomUUID } from "crypto";
import type { ILogger } from "../../shared/interfaces";
import type { ISpan, ITraceContext, ITracer } from "../interfaces/telemetry";

class ConsoleSpan implements ISpan {
  readonly context: ITraceContext;
  private readonly attributes: Record<string, unknown> = {};
  private ended = false;

  constructor(
    private readonly name: string,
    context: ITraceContext,
    private readonly logger: ILogger,
    private readonly enabled: boolean
  ) {
    this.context = context;
    if (this.enabled) {
      this.logger.debug("trace.span.start", {
        name: this.name,
        ...this.context,
      });
    }
  }

  setAttribute(key: string, value: unknown): void {
    this.attributes[key] = value;
  }

  recordError(error: unknown): void {
    this.attributes.error =
      error instanceof Error
        ? { message: error.message, name: error.name }
        : String(error);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    if (!this.enabled) return;
    this.logger.debug("trace.span.end", {
      name: this.name,
      ...this.context,
      attributes: this.attributes,
    });
  }
}

export class ConsoleTracer implements ITracer {
  constructor(
    private readonly logger: ILogger,
    private readonly enabled: boolean
  ) {}

  startSpan(name: string, parent?: ITraceContext): ISpan {
    const context: ITraceContext = {
      traceId: parent?.traceId ?? randomUUID(),
      spanId: randomUUID(),
      parentSpanId: parent?.spanId,
    };
    return new ConsoleSpan(name, context, this.logger, this.enabled);
  }
}
