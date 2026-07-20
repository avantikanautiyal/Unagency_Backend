# Migration Guide

## Engine

`IMigrationEngine`:

1. `register(MigrationDefinition)` — id, version, environments, up/down
2. `migrate(env, targetVersion?)` — apply pending
3. `rollback(env, steps?)` — reverse last N
4. `seed(env, SeedDefinition[])` — insert via repositories
5. `applied(env)` — inspect history

## Baseline

`registerBaselineMigrations` ships versions 1–3 (collections, encryption metadata, outbox).

## Environments

`development` · `test` · `staging` · `production` — each tracks applied versions independently.
