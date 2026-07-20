# Transaction Model

## Unit of Work

`IUnitOfWork`: begin → register(work) → commit | rollback

## Transaction Manager

`runInTransaction(fn)` begins UoW, invokes `fn`, commits on success, rolls back on failure.

## Optimistic concurrency

Conflicting `expectedVersion` yields validation error with `conflict: true` metadata.
No dialect-specific locking required for the abstraction.
