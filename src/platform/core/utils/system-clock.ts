import type { IClock } from "../interfaces/primitives";

export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }

  nowIso(): string {
    return this.now().toISOString();
  }
}
