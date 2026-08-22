/**
 * Background OS production worker — delivery + task graph queue ticks.
 */

import type { OsProductionRuntime } from "./os-production-runtime";

export interface OsProductionWorkerOptions {
  readonly runtime: OsProductionRuntime;
  readonly workerId?: string;
  readonly tickIntervalMs?: number;
}

export class OsProductionWorker {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private shutDown = false;
  private activeTicks = 0;

  constructor(private readonly deps: OsProductionWorkerOptions) {}

  start(): void {
    if (this.timer) return;
    const interval = this.deps.tickIntervalMs ?? 500;
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);
  }

  async tick(): Promise<void> {
    if (this.shutDown) return;
    this.running = true;
    this.activeTicks += 1;
    const workerId = this.deps.workerId ?? "os-production-worker";
    try {
      await this.deps.runtime.tickDeliveryWorker(workerId);
      await this.deps.runtime.tickTaskWorker(workerId);
    } finally {
      this.activeTicks -= 1;
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
    while (this.activeTicks > 0 && Date.now() < deadline) {
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
