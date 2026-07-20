# Repository Model

## Contract

`IEntityRepository<T>`:

- `get` / `list` / `save` / `delete`
- `WriteOptions.expectedVersion` for concurrency
- `WriteOptions.encryptFields` for at-rest field encryption

## Collections

See `ALL_ENTITY_COLLECTIONS` — organizations, users, teams, projects, brands,
campaigns, knowledge_*, prompt_library, executions, execution_history, experience,
learning_artifacts, evaluation_reports, provider_catalog, model_registry,
marketplace, templates, subscriptions, invoices, audit_logs, notifications, settings.

## Envelope

`PersistedEntity`: id, collection, payload, version, timestamps, organizationId,
encryptedFields.
