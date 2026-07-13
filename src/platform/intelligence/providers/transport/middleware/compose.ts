/**
 * Middleware composition.
 *
 * Purpose: Build an onion of transport middleware ending in a terminal invoke.
 * Responsibilities: Order-preserving composition; request+response mutation.
 * Usage: Used by the dispatcher.
 * Future Extension: Conditional/branching middleware.
 */

import type { TransportContext } from "../contracts/context";
import type {
  ITransportMiddleware,
  TransportInvoke,
} from "../interfaces/engine";

export function composeMiddleware(
  middlewares: readonly ITransportMiddleware[],
  context: TransportContext,
  terminal: TransportInvoke
): TransportInvoke {
  return middlewares.reduceRight<TransportInvoke>(
    (next, middleware) => (request) => middleware.handle(request, context, next),
    terminal
  );
}
