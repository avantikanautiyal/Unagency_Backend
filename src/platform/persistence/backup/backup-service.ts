/**
 * Snapshots, backup, restore, export/import abstractions.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { NotFoundError, ValidationError } from "../../intelligence/shared/errors";
import type {
  BackupArtifact,
  BackupKind,
  EntityCollection,
  RestorePoint,
  SnapshotRecord,
} from "../contracts";
import type { IBackupService, IBlobStorage, ISnapshotStore } from "../interfaces";
import type { EntityStore } from "../repositories/entity-store";

export class SnapshotStore implements ISnapshotStore {
  private readonly snapshots = new Map<string, { meta: SnapshotRecord; data: Record<string, unknown> }>();

  constructor(
    private readonly entityStore: EntityStore,
    private readonly nowIso: () => string,
    private readonly createId: (prefix: string) => string
  ) {}

  async create(
    collections: readonly EntityCollection[],
    kind: BackupKind = "snapshot"
  ): Promise<Result<SnapshotRecord>> {
    const full = this.entityStore.snapshot();
    const data: Record<string, unknown> = {};
    let entityCount = 0;
    const cols =
      collections.length > 0 ? collections : (Object.keys(full) as EntityCollection[]);
    for (const c of cols) {
      const rows = full[c] ?? [];
      data[c] = rows;
      entityCount += rows.length;
    }
    const snapshotId = this.createId("snap");
    const meta: SnapshotRecord = {
      snapshotId,
      kind,
      createdAt: this.nowIso(),
      collections: cols,
      entityCount,
      checksum: `chk_${entityCount}_${snapshotId}`,
    };
    this.snapshots.set(snapshotId, { meta, data });
    return success(meta);
  }

  async get(snapshotId: string): Promise<Result<SnapshotRecord | undefined>> {
    return success(this.snapshots.get(snapshotId)?.meta);
  }

  async list(): Promise<Result<readonly SnapshotRecord[]>> {
    return success([...this.snapshots.values()].map((s) => s.meta));
  }

  /** Internal restore of snapshot data. */
  loadData(snapshotId: string): Record<string, unknown> | undefined {
    return this.snapshots.get(snapshotId)?.data;
  }
}

export class BackupService implements IBackupService {
  private readonly backups = new Map<string, BackupArtifact>();
  private readonly restorePoints = new Map<string, RestorePoint>();

  constructor(
    private readonly snapshots: SnapshotStore,
    private readonly entityStore: EntityStore,
    private readonly blobs: IBlobStorage,
    private readonly nowIso: () => string,
    private readonly createId: (prefix: string) => string
  ) {}

  async fullBackup(): Promise<Result<BackupArtifact>> {
    const snap = await this.snapshots.create(
      this.entityStore.collections().length
        ? this.entityStore.collections()
        : ([
            "organizations",
            "users",
            "campaigns",
            "executions",
          ] as EntityCollection[]),
      "full"
    );
    if (!snap.ok) return snap;
    const storageKey = `backups/${snap.value.snapshotId}.json`;
    const data = this.snapshots.loadData(snap.value.snapshotId);
    await this.blobs.put(storageKey, JSON.stringify(data ?? {}), "application/json");
    const artifact: BackupArtifact = {
      backupId: this.createId("bak"),
      kind: "full",
      createdAt: this.nowIso(),
      snapshotId: snap.value.snapshotId,
      storageKey,
    };
    this.backups.set(artifact.backupId, artifact);
    return success(artifact);
  }

  async incrementalBackup(baseBackupId: string): Promise<Result<BackupArtifact>> {
    const base = this.backups.get(baseBackupId);
    if (!base) return failure(new NotFoundError("base backup not found"));
    const snap = await this.snapshots.create(this.entityStore.collections(), "incremental");
    if (!snap.ok) return snap;
    const storageKey = `backups/incr_${snap.value.snapshotId}.json`;
    await this.blobs.put(
      storageKey,
      JSON.stringify(this.snapshots.loadData(snap.value.snapshotId) ?? {}),
      "application/json"
    );
    const artifact: BackupArtifact = {
      backupId: this.createId("bak"),
      kind: "incremental",
      createdAt: this.nowIso(),
      snapshotId: snap.value.snapshotId,
      baseBackupId,
      storageKey,
    };
    this.backups.set(artifact.backupId, artifact);
    return success(artifact);
  }

  async createRestorePoint(backupId: string, label: string): Promise<Result<RestorePoint>> {
    if (!this.backups.has(backupId)) return failure(new NotFoundError("backup not found"));
    const rp: RestorePoint = {
      restorePointId: this.createId("rp"),
      backupId,
      createdAt: this.nowIso(),
      label,
    };
    this.restorePoints.set(rp.restorePointId, rp);
    return success(rp);
  }

  async restore(restorePointId: string): Promise<Result<{ restoredEntities: number }>> {
    const rp = this.restorePoints.get(restorePointId);
    if (!rp) return failure(new NotFoundError("restore point not found"));
    const bak = this.backups.get(rp.backupId);
    if (!bak) return failure(new NotFoundError("backup not found"));
    const blob = await this.blobs.get(bak.storageKey);
    if (!blob.ok || !blob.value) return failure(new ValidationError("backup blob missing"));
    const data = JSON.parse(blob.value.data) as Record<string, import("../contracts").PersistedEntity[]>;
    const n = this.entityStore.restore(data);
    return success({ restoredEntities: n });
  }

  async exportAll(): Promise<Result<{ exportId: string; payload: unknown }>> {
    const exportId = this.createId("exp");
    return success({ exportId, payload: this.entityStore.snapshot() });
  }

  async importAll(payload: unknown): Promise<Result<{ imported: number }>> {
    if (!payload || typeof payload !== "object") {
      return failure(new ValidationError("invalid import payload"));
    }
    const n = this.entityStore.restore(
      payload as Record<string, import("../contracts").PersistedEntity[]>
    );
    return success({ imported: n });
  }
}
