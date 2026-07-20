# Backups

Use:

```bash
./deployment/scripts/backup.sh
```

Artifacts land in `deployment/backups/artifacts/` (gitignored pattern recommended).

Also invoke Persistence `engine.backup().fullBackup()` from an ops job for application-level snapshots.
