/**
 * Default transport timeout engine.
 *
 * Purpose: Bound a transport operation by time. Transport timeout only.
 * Responsibilities: Race the operation against a timer; fail on expiry.
 * Usage: Injected into the dispatcher.
 * Future Extension: Adaptive/per-phase timeouts.
 *
 * Uses in-process timers only. No networking.
 */

import { failure, type Result } from "../../../shared/result";
import { TimeoutError } from "../../../shared/errors";
import type { ITransportTimeoutEngine } from "../interfaces/engines";

export class DefaultTransportTimeoutEngine implements ITransportTimeoutEngine {
  async run<T>(
    operation: () => Promise<Result<T>>,
    timeoutMs: number
  ): Promise<Result<T>> {
    if (timeoutMs <= 0) {
      return operation();
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<Result<T>>((resolve) => {
      timer = setTimeout(
        () =>
          resolve(
            failure(
              new TimeoutError("transport operation timed out", { timeoutMs })
            )
          ),
        timeoutMs
      );
    });

    try {
      return await Promise.race([operation(), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
