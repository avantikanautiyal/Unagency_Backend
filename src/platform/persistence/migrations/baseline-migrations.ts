/**
 * Baseline migrations — environment-aware schema versioning seeds.
 */

import type { IMigrationEngine } from "../interfaces";
import type { MigrationDefinition } from "../contracts";

const baseline: readonly MigrationDefinition[] = [
  {
    id: "20260715_001_init_collections",
    version: 1,
    name: "init_collections",
    environments: ["development", "test", "staging", "production"],
    up: () => {
      /* collection registration is adapter-side; marker migration */
    },
    down: () => {
      /* no-op marker */
    },
  },
  {
    id: "20260715_002_add_encryption_metadata",
    version: 2,
    name: "add_encryption_metadata",
    environments: ["development", "test", "staging", "production"],
    up: () => {
      /* encryptedFields support already in PersistedEntity */
    },
    down: () => {
      /* */
    },
  },
  {
    id: "20260715_003_outbox_tables",
    version: 3,
    name: "outbox_tables",
    environments: ["development", "test", "staging", "production"],
    up: () => {
      /* outbox is interface-backed */
    },
    down: () => {
      /* */
    },
  },
];

export function registerBaselineMigrations(engine: IMigrationEngine): void {
  for (const m of baseline) {
    engine.register(m);
  }
}
