/**
 * Background async provider reconciliation worker.
 */

import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderOperationRecord } from "../contracts/provider-operation";
import type { IAsyncProviderDispatcher } from "../interfaces/async-provider-dispatcher";
import type { IProviderOperationStore } from "../interfaces/provider-operation-store";
import { AsyncProviderRuntime } from "../runtime/async-provider-runtime";

export type AsyncDispatcherResolver = (
  op: ProviderOperationRecord
) => IAsyncProviderDispatcher | undefined;

export interface AsyncReconciliationWorkerOptions {
  readonly runtime: AsyncProviderRuntime;
  readonly store: IProviderOperationStore;
  readonly workerId?: string;
  readonly tickIntervalMs?: number;
}

export class AsyncReconciliationWorker {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private shutDown = false;
  private activeClaims = 0;
  private resolveDispatcher: AsyncDispatcherResolver | undefined;
  private buildRequest:
    | ((op: ProviderOperationRecord) => ProviderExecutionRequest)
    | undefined;
  private token: CancellationToken = { cancelled: false, reason: undefined };

  constructor(private readonly deps: AsyncReconciliationWorkerOptions) {}

  start(
    resolveDispatcher:
      | IAsyncProviderDispatcher
      | AsyncDispatcherResolver,
    buildRequest: (op: ProviderOperationRecord) => ProviderExecutionRequest,
    token: CancellationToken = { cancelled: false, reason: undefined }
  ): void {
    if (this.timer) return;
    this.resolveDispatcher =
      typeof resolveDispatcher === "function"
        ? resolveDispatcher
        : () => resolveDispatcher;
    this.buildRequest = buildRequest;
    this.token = token;
    const interval = this.deps.tickIntervalMs ?? 500;
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);
  }

  async tick(): Promise<void> {
    if (this.shutDown || !this.resolveDispatcher || !this.buildRequest) return;
    this.running = true;
    this.activeClaims += 1;
    try {
      await this.deps.runtime.reconcile(
        this.deps.workerId ?? "async-reconciler",
        this.resolveDispatcher,
        this.buildRequest,
        this.token,
        20
      );
    } finally {
      this.activeClaims -= 1;
      this.running = false;
    }
  }

  async shutdown(): Promise<void> {
    this.shutDown = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    const deadline = Date.now() + 10_000;
    while (this.activeClaims > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  isShutDown(): boolean {
    return this.shutDown;
  }
}
