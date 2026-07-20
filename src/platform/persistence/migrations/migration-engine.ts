/**
 * Migration engine — schema versioning, rollback, seeds, environments.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import type {
  MigrationDefinition,
  MigrationEnvironment,
  MigrationRecord,
  SeedDefinition,
} from "../contracts";
import type { IMigrationEngine, IEntityRepository } from "../interfaces";
import type { EntityCollection } from "../contracts";

export class MigrationEngine implements IMigrationEngine {
  private readonly definitions: MigrationDefinition[] = [];
  private readonly appliedByEnv = new Map<MigrationEnvironment, MigrationRecord[]>();

  constructor(
    private readonly nowIso: () => string,
    private readonly resolveRepo: (collection: EntityCollection) => IEntityRepository
  ) {}

  register(migration: MigrationDefinition): Result<void> {
    if (this.definitions.some((d) => d.id === migration.id || d.version === migration.version)) {
      return failure(new ValidationError("duplicate migration id or version"));
    }
    this.definitions.push(migration);
    this.definitions.sort((a, b) => a.version - b.version);
    return success(undefined);
  }

  async migrate(
    environment: MigrationEnvironment,
    targetVersion?: number
  ): Promise<Result<readonly MigrationRecord[]>> {
    const applied = this.appliedByEnv.get(environment) ?? [];
    const appliedVersions = new Set(applied.map((a) => a.version));
    const pending = this.definitions.filter(
      (d) =>
        d.environments.includes(environment) &&
        !appliedVersions.has(d.version) &&
        (targetVersion === undefined || d.version <= targetVersion)
    );

    const newly: MigrationRecord[] = [];
    for (const m of pending) {
      await m.up();
      const record: MigrationRecord = {
        id: m.id,
        version: m.version,
        name: m.name,
        appliedAt: this.nowIso(),
        environment,
        checksum: `sha_${m.id}_${m.version}`,
      };
      newly.push(record);
      applied.push(record);
    }
    this.appliedByEnv.set(environment, applied);
    return success(newly);
  }

  async rollback(
    environment: MigrationEnvironment,
    steps = 1
  ): Promise<Result<readonly MigrationRecord[]>> {
    const applied = this.appliedByEnv.get(environment) ?? [];
    if (!applied.length) return success([]);
    const rolled: MigrationRecord[] = [];
    for (let i = 0; i < steps && applied.length; i++) {
      const last = applied.pop()!;
      const def = this.definitions.find((d) => d.id === last.id);
      if (!def) return failure(new ValidationError(`migration definition missing: ${last.id}`));
      await def.down();
      rolled.push(last);
    }
    this.appliedByEnv.set(environment, applied);
    return success(rolled);
  }

  applied(environment: MigrationEnvironment): Result<readonly MigrationRecord[]> {
    return success(this.appliedByEnv.get(environment) ?? []);
  }

  async seed(
    environment: MigrationEnvironment,
    seeds: readonly SeedDefinition[]
  ): Promise<Result<{ inserted: number }>> {
    void environment;
    let inserted = 0;
    for (const seed of seeds) {
      const repo = this.resolveRepo(seed.collection);
      for (const row of seed.rows) {
        const id = String(row.id ?? `${seed.seedId}_${inserted}`);
        const saved = await repo.save(id, row, {
          organizationId: row.organizationId ? String(row.organizationId) : undefined,
        });
        if (!saved.ok) return saved;
        inserted++;
      }
    }
    return success({ inserted });
  }
}
