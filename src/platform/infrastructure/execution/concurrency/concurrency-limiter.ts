/**
 * Concurrency slots and backpressure.
 */

export class ConcurrencyLimiter {
  private active = 0;

  constructor(private readonly maxSlots: number) {}

  tryAcquire(): boolean {
    if (this.active >= this.maxSlots) return false;
    this.active += 1;
    return true;
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
  }

  utilization(): number {
    if (this.maxSlots <= 0) return 1;
    return this.active / this.maxSlots;
  }

  available(): number {
    return Math.max(0, this.maxSlots - this.active);
  }

  getActive(): number {
    return this.active;
  }
}
