/**
 * Built-in transport middleware.
 *
 * Purpose: Reusable, provider-independent middleware.
 * Responsibilities: logging, metrics, tracing, compression, auth placeholder,
 *   request mutation, response mutation.
 * Usage: Registered in the dispatcher's middleware chain.
 * Future Extension: Real tracing/auth integrations.
 *
 * NO secrets are logged. NO networking. Auth is a placeholder only.
 */

import type { Result } from "../../../shared/result";
import type { TransportContext } from "../contracts/context";
import type { CompressionAlgorithm } from "../contracts/enums";
import type {
  TransportRequest,
  TransportResponse,
} from "../contracts/transport-io";
import type { ITransportDiagnostics } from "../interfaces/diagnostics";
import type {
  ITransportMiddleware,
  TransportInvoke,
} from "../interfaces/engine";
import type { ICompressor } from "../interfaces/serde";
import { byteLength } from "../serializers/default-serializer";

export interface TransportLogger {
  log(event: string, data: Readonly<Record<string, unknown>>): void;
}

const NOOP_LOGGER: TransportLogger = { log: () => undefined };

export class LoggingMiddleware implements ITransportMiddleware {
  readonly name = "logging";
  constructor(private readonly logger: TransportLogger = NOOP_LOGGER) {}

  async handle(
    request: TransportRequest,
    context: TransportContext,
    next: TransportInvoke
  ): Promise<Result<TransportResponse>> {
    this.logger.log("transport.request", {
      requestId: request.requestId,
      protocol: request.protocol,
      operation: request.operation,
    });
    const result = await next(request);
    this.logger.log("transport.response", {
      requestId: request.requestId,
      ok: result.ok,
    });
    return result;
  }
}

export class MetricsMiddleware implements ITransportMiddleware {
  readonly name = "metrics";
  constructor(
    private readonly diagnostics: ITransportDiagnostics,
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  async handle(
    request: TransportRequest,
    _context: TransportContext,
    next: TransportInvoke
  ): Promise<Result<TransportResponse>> {
    const start = this.clockMs();
    const result = await next(request);
    this.diagnostics.recordLatency(request.protocol, this.clockMs() - start);
    return result;
  }
}

export class TracingMiddleware implements ITransportMiddleware {
  readonly name = "tracing";
  async handle(
    request: TransportRequest,
    _context: TransportContext,
    next: TransportInvoke
  ): Promise<Result<TransportResponse>> {
    // A real tracer would open a span here keyed by request.requestId.
    return next(request);
  }
}

export class CompressionMiddleware implements ITransportMiddleware {
  readonly name = "compression";
  constructor(
    private readonly compressor: ICompressor,
    private readonly algorithm: CompressionAlgorithm = "none",
    private readonly diagnostics?: ITransportDiagnostics
  ) {}

  async handle(
    request: TransportRequest,
    _context: TransportContext,
    next: TransportInvoke
  ): Promise<Result<TransportResponse>> {
    if (this.algorithm === "none") {
      this.diagnostics?.recordSerialization(byteLength(request.body));
      return next(request);
    }
    const compressed = this.compressor.compress(request.body, this.algorithm);
    if (!compressed.ok) {
      return compressed;
    }
    this.diagnostics?.recordSerialization(compressed.value.bytes);
    const mutated: TransportRequest = {
      ...request,
      body: compressed.value.body,
      compression: this.algorithm,
      headers: { ...request.headers, "content-encoding": this.algorithm },
    };
    return next(mutated);
  }
}

export class AuthPlaceholderMiddleware implements ITransportMiddleware {
  readonly name = "auth";
  async handle(
    request: TransportRequest,
    _context: TransportContext,
    next: TransportInvoke
  ): Promise<Result<TransportResponse>> {
    // Placeholder: credential injection is the Identity platform's concern (M4.2)
    // and is applied by a future concrete client. No secrets are handled here.
    return next(request);
  }
}

export class RequestMutationMiddleware implements ITransportMiddleware {
  readonly name = "request-mutation";
  constructor(
    private readonly mutate: (request: TransportRequest) => TransportRequest
  ) {}

  async handle(
    request: TransportRequest,
    _context: TransportContext,
    next: TransportInvoke
  ): Promise<Result<TransportResponse>> {
    return next(this.mutate(request));
  }
}

export class ResponseMutationMiddleware implements ITransportMiddleware {
  readonly name = "response-mutation";
  constructor(
    private readonly mutate: (response: TransportResponse) => TransportResponse
  ) {}

  async handle(
    request: TransportRequest,
    _context: TransportContext,
    next: TransportInvoke
  ): Promise<Result<TransportResponse>> {
    const result = await next(request);
    if (!result.ok) {
      return result;
    }
    return { ok: true, value: this.mutate(result.value) };
  }
}
