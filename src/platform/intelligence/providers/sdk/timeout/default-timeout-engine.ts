/**
 * Default SDK timeout engine.
 *
 * Purpose: Bound SDK operations by time. SDK timeout only.
 * Responsibilities: Race operation against timer.
 * Usage: Injected into the SDK engine.
 * Future Extension: Per-phase timeouts.
 */

import { failure, type Result } from "../../../shared/result";
import { TimeoutError } from "../../../shared/errors";
import type { ISdkTimeoutEngine } from "../interfaces/engines";

export class DefaultSdkTimeoutEngine implements ISdkTimeoutEngine {
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
              new TimeoutError("SDK operation timed out", { timeoutMs })
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
