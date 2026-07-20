/**
 * Unit of Work — coordinates transactional work without exposing dialect.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import type { IUnitOfWork } from "../interfaces";

export class InMemoryUnitOfWork implements IUnitOfWork {
  private active = false;
  private readonly ops: Array<() => Promise<void> | void> = [];
  private readonly undo: Array<() => Promise<void> | void> = [];

  async begin(): Promise<Result<void>> {
    if (this.active) return failure(new ValidationError("unit of work already active"));
    this.active = true;
    this.ops.length = 0;
    this.undo.length = 0;
    return success(undefined);
  }

  register(work: () => Promise<void> | void): void {
    if (!this.active) throw new ValidationError("unit of work not active");
    this.ops.push(work);
  }

  /** Test/helper: register compensating action for rollback. */
  registerCompensation(work: () => Promise<void> | void): void {
    this.undo.push(work);
  }

  async commit(): Promise<Result<void>> {
    if (!this.active) return failure(new ValidationError("unit of work not active"));
    try {
      for (const op of this.ops) await op();
      this.active = false;
      this.ops.length = 0;
      this.undo.length = 0;
      return success(undefined);
    } catch (e) {
      await this.rollback();
      return failure(new ValidationError("commit failed", { cause: String(e) }));
    }
  }

  async rollback(): Promise<Result<void>> {
    if (!this.active && this.undo.length === 0) {
      return success(undefined);
    }
    for (const op of [...this.undo].reverse()) await op();
    this.active = false;
    this.ops.length = 0;
    this.undo.length = 0;
    return success(undefined);
  }

  isActive(): boolean {
    return this.active;
  }
}
