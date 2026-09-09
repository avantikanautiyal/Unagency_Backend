/**
 * Worker registry — workers execute jobs, never own Intelligence.
 */

import type { WorkerKind } from "../contracts/enums";
import type { WorkerId, WorkerRecord } from "../contracts/job";
import { asWorkerId } from "../contracts/job";

export class WorkerRegistry {
  private readonly workers = new Map<string, WorkerRecord>();

  constructor(
    private readonly createId: (prefix: string) => string,
    private readonly nowIso: () => string
  ) {}

  register(kind: WorkerKind, capacity = 2): WorkerRecord {
    const worker: WorkerRecord = {
      workerId: asWorkerId(this.createId(`worker_${kind}`)),
      kind,
      capacity,
      activeJobs: 0,
      healthy: true,
      lastHeartbeatAt: this.nowIso(),
    };
    this.workers.set(String(worker.workerId), worker);
    return worker;
  }

  heartbeat(workerId: WorkerId): void {
    const w = this.workers.get(String(workerId));
    if (!w) return;
    this.workers.set(String(workerId), {
      ...w,
      lastHeartbeatAt: this.nowIso(),
      healthy: true,
    });
  }

  adjustActive(workerId: WorkerId, delta: number): void {
    const w = this.workers.get(String(workerId));
    if (!w) return;
    this.workers.set(String(workerId), {
      ...w,
      activeJobs: Math.max(0, w.activeJobs + delta),
      lastHeartbeatAt: this.nowIso(),
    });
  }

  pickAvailable(kind?: WorkerKind): WorkerRecord | undefined {
    return [...this.workers.values()].find(
      (w) =>
        w.healthy &&
        w.activeJobs < w.capacity &&
        (!kind || w.kind === kind),
    );
  }

  list(): readonly WorkerRecord[] {
    return [...this.workers.values()];
  }

  utilization(): number {
    const workers = [...this.workers.values()];
    if (!workers.length) return 0;
    const capacity = workers.reduce((n, w) => n + w.capacity, 0);
    const active = workers.reduce((n, w) => n + w.activeJobs, 0);
    return capacity === 0 ? 0 : active / capacity;
  }

  markUnhealthy(workerId: WorkerId): void {
    const w = this.workers.get(String(workerId));
    if (!w) return;
    this.workers.set(String(workerId), { ...w, healthy: false });
  }
}
