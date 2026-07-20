# Restore

1. Identify backup meta under `deployment/backups/artifacts/`.
2. Scale API/workers to 0.
3. Restore Postgres dump / Persistence restore point.
4. Run migration job.
5. Scale services back.
6. Validate health + a sample execution.
