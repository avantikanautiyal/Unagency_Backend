/**
 * M9.5O1 — Active stream registry for graceful shutdown (no content stored).
 */

export interface ActiveStreamRecord {
  readonly executionId: string;
  readonly attemptId: string;
  readonly organizationId?: string;
  readonly providerId: string;
  readonly startedAt: string;
  readonly committed: boolean;
  readonly abort: AbortController;
}

export class ActiveStreamRegistry {
  private readonly byExecution = new Map<string, ActiveStreamRecord>();
  private accepting = true;

  get acceptingNewStreams(): boolean {
    return this.accepting;
  }

  stopAccepting(): void {
    this.accepting = false;
  }

  register(record: ActiveStreamRecord): void {
    this.byExecution.set(record.executionId, record);
  }

  markCommitted(executionId: string): void {
    const existing = this.byExecution.get(executionId);
    if (!existing) return;
    this.byExecution.set(executionId, { ...existing, committed: true });
  }

  unregister(executionId: string): void {
    this.byExecution.delete(executionId);
  }

  get(executionId: string): ActiveStreamRecord | undefined {
    return this.byExecution.get(executionId);
  }

  list(): readonly ActiveStreamRecord[] {
    return [...this.byExecution.values()];
  }

  count(): number {
    return this.byExecution.size;
  }

  /**
   * Drain then abort remaining. Each instance only owns its local streams.
   */
  async shutdown(opts: {
    readonly drainMs: number;
    readonly reason?: string;
    readonly sleep?: (ms: number) => Promise<void>;
  }): Promise<{ drained: number; aborted: number }> {
    this.accepting = false;
    const sleep =
      opts.sleep ??
      ((ms) => (ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms))));
    await sleep(opts.drainMs);
    let aborted = 0;
    for (const rec of this.byExecution.values()) {
      if (!rec.abort.signal.aborted) {
        rec.abort.abort(opts.reason ?? "server_shutdown");
        aborted += 1;
      }
    }
    const drained = this.byExecution.size;
    this.byExecution.clear();
    return { drained, aborted };
  }
}

/** Process-local singleton for production wiring. */
let globalRegistry: ActiveStreamRegistry | undefined;

export function getActiveStreamRegistry(): ActiveStreamRegistry {
  if (!globalRegistry) globalRegistry = new ActiveStreamRegistry();
  return globalRegistry;
}

export function resetActiveStreamRegistryForTests(): void {
  globalRegistry = new ActiveStreamRegistry();
}
