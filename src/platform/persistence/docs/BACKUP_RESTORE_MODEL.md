# Backup & Restore Model

| Capability | API |
|------------|-----|
| Snapshot | `snapshots().create(collections)` |
| Full backup | `backup().fullBackup()` |
| Incremental | `backup().incrementalBackup(baseId)` |
| Restore point | `backup().createRestorePoint(backupId, label)` |
| Restore | `backup().restore(restorePointId)` |
| Export / Import | `backup().exportAll()` / `importAll(payload)` |

Artifacts stored via `IBlobStorage` (S3-compatible interface).
