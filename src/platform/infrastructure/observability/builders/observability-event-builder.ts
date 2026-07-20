/**
 * Observability event builder.
 */

import type { ObservabilityEvent, ObservedSurface, TelemetryContext, SpanStatus } from "../contracts";

export class ObservabilityEventBuilder {
  private eventId = "";
  private surface: ObservedSurface = "api";
  private at = new Date().toISOString();
  private context: TelemetryContext = { correlationId: "", traceId: "" };
  private span?: ObservabilityEvent["span"];
  private metrics: NonNullable<ObservabilityEvent["metrics"]> = [];
  private tokens?: ObservabilityEvent["tokens"];
  private cost?: ObservabilityEvent["cost"];
  private health?: ObservabilityEvent["health"];
  private log?: ObservabilityEvent["log"];

  static create(): ObservabilityEventBuilder {
    return new ObservabilityEventBuilder();
  }

  withEventId(id: string): this {
    this.eventId = id;
    return this;
  }

  withSurface(surface: ObservedSurface): this {
    this.surface = surface;
    return this;
  }

  withAt(at: string): this {
    this.at = at;
    return this;
  }

  withContext(context: TelemetryContext): this {
    this.context = context;
    return this;
  }

  withSpan(input: {
    name: string;
    status?: SpanStatus;
    durationMs: number;
    startedAt: string;
    completedAt: string;
    errorMessage?: string;
  }): this {
    this.span = {
      name: input.name,
      surface: this.surface,
      status: input.status ?? "ok",
      durationMs: input.durationMs,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      errorMessage: input.errorMessage,
    };
    return this;
  }

  addMetric(name: string, value: number, unit = "count"): this {
    this.metrics = [...this.metrics, { name, value, unit }];
    return this;
  }

  withTokens(tokens: NonNullable<ObservabilityEvent["tokens"]>): this {
    this.tokens = tokens;
    return this;
  }

  withCost(cost: NonNullable<ObservabilityEvent["cost"]>): this {
    this.cost = cost;
    return this;
  }

  withHealth(health: NonNullable<ObservabilityEvent["health"]>): this {
    this.health = health;
    return this;
  }

  withLog(level: "debug" | "info" | "warn" | "error", message: string): this {
    this.log = { level, message };
    return this;
  }

  build(): ObservabilityEvent {
    return {
      eventId: this.eventId,
      surface: this.surface,
      at: this.at,
      context: this.context,
      span: this.span,
      metrics: this.metrics.length ? this.metrics : undefined,
      tokens: this.tokens,
      cost: this.cost,
      health: this.health,
      log: this.log,
    };
  }
}
