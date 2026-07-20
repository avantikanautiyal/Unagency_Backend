/**
 * Transaction manager — runs work inside a Unit of Work.
 */

import { success, type Result } from "../../intelligence/shared/result";
import type { ITransactionManager, IUnitOfWork } from "../interfaces";
import { InMemoryUnitOfWork } from "../unit-of-work/in-memory-unit-of-work";

export class TransactionManager implements ITransactionManager {
  async runInTransaction<T>(
    fn: (uow: IUnitOfWork) => Promise<Result<T>>
  ): Promise<Result<T>> {
    const uow = new InMemoryUnitOfWork();
    const began = await uow.begin();
    if (!began.ok) return began;

    try {
      const result = await fn(uow);
      if (!result.ok) {
        await uow.rollback();
        return result;
      }
      const committed = await uow.commit();
      if (!committed.ok) return committed;
      return success(result.value);
    } catch (e) {
      await uow.rollback();
      throw e;
    }
  }
}
