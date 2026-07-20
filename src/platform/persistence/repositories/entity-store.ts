/**
 * Shared in-process entity store used by memory / postgres / mongodb adapters.
 * Dialects differ only by adapter metadata — business code never sees this.
 */

import type { EntityCollection, PersistedEntity } from "../contracts";

export class EntityStore {
  private readonly tables = new Map<EntityCollection, Map<string, PersistedEntity>>();

  table(collection: EntityCollection): Map<string, PersistedEntity> {
    let t = this.tables.get(collection);
    if (!t) {
      t = new Map();
      this.tables.set(collection, t);
    }
    return t;
  }

  collections(): EntityCollection[] {
    return [...this.tables.keys()];
  }

  snapshot(): Record<string, PersistedEntity[]> {
    const out: Record<string, PersistedEntity[]> = {};
    for (const [k, map] of this.tables) {
      out[k] = [...map.values()];
    }
    return out;
  }

  restore(data: Record<string, PersistedEntity[]>): number {
    let n = 0;
    this.tables.clear();
    for (const [k, rows] of Object.entries(data)) {
      const map = new Map<string, PersistedEntity>();
      for (const row of rows) {
        map.set(row.id, row);
        n++;
      }
      this.tables.set(k as EntityCollection, map);
    }
    return n;
  }

  clear(): void {
    this.tables.clear();
  }
}
