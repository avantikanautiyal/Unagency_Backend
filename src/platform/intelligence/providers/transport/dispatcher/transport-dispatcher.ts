/**
 * Transport dispatcher.
 *
 * Purpose: Select a protocol client and invoke it through middleware, retry,
 *   and timeout. Transport-only concerns — no provider logic.
 * Responsibilities: resolve client → compose middleware → timeout → retry.
 * Usage: Injected into the pipeline.
 * Future Extension: Per-protocol dispatch policies, hedged requests.
 */

import type { IntelligenceError } from "../../../shared/errors";
import { failure, success, type Result } from "../../../shared/result";
import type { TransportContext } from "../contracts/context";
import type { TransportRequest } from "../contracts/transport-io";
import type { ITransportClientRegistry } from "../interfaces/clients";
import type {
  DispatchOutcome,
  ITransportDispatcher,
  ITransportMiddleware,
  TransportInvoke,
} from "../interfaces/engine";
import type {
  ITransportHealthMonitor,
  ITransportRetryEngine,
  ITransportTimeoutEngine,
  TransportRetryPolicy,
} from "../interfaces/engines";
import { composeMiddleware } from "../middleware/compose";

const DEFAULT_RETRY_POLICY: TransportRetryPolicy = {
  strategy: "none",
  maxAttempts: 1,
  baseDelayMs: 0,
};

const RETRYABLE_CODES = new Set([
  "TIMEOUT_ERROR",
  "RATE_LIMIT_ERROR",
]);

export interface TransportDispatcherDeps {
  readonly clientRegistry: ITransportClientRegistry;
  readonly retryEngine: ITransportRetryEngine;
  readonly timeoutEngine: ITransportTimeoutEngine;
  readonly middlewares?: readonly ITransportMiddleware[];
  readonly healthMonitor?: ITransportHealthMonitor;
  readonly retryPolicy?: TransportRetryPolicy;
  readonly isRetryable?: (error: IntelligenceError) => boolean;
}

export class TransportDispatcher implements ITransportDispatcher {
  private readonly middlewares: readonly ITransportMiddleware[];
  private readonly retryPolicy: TransportRetryPolicy;
  private readonly isRetryable: (error: IntelligenceError) => boolean;

  constructor(private readonly deps: TransportDispatcherDeps) {
    this.middlewares = deps.middlewares ?? [];
    this.retryPolicy = deps.retryPolicy ?? DEFAULT_RETRY_POLICY;
    this.isRetryable =
      deps.isRetryable ?? ((error) => RETRYABLE_CODES.has(error.code));
  }

  async dispatch(
    request: TransportRequest,
    context: TransportContext
  ): Promise<Result<DispatchOutcome>> {
    const clientResult = this.deps.clientRegistry.resolve(request.protocol);
    if (!clientResult.ok) {
      return clientResult;
    }
    const client = clientResult.value;

    const terminal: TransportInvoke = (req) => client.send(req, context);
    const chain = composeMiddleware(this.middlewares, context, terminal);

    const outcome = await this.deps.retryEngine.execute(
      () => this.deps.timeoutEngine.run(() => chain(request), request.timeoutMs),
      this.retryPolicy,
      this.isRetryable
    );

    this.deps.healthMonitor?.record(request.protocol, outcome.result.ok);

    if (!outcome.result.ok) {
      return failure(outcome.result.error);
    }

    return success({
      response: outcome.result.value,
      attempts: outcome.attempts,
      retries: outcome.retries,
    });
  }
}
