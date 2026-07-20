# Backup Guide

```bash
bash deployment/scripts/backup.sh
```

Also use Persistence `backup().fullBackup()` / incremental APIs from an ops job.
Store artifacts off-cluster (S3-compatible) for DR.
