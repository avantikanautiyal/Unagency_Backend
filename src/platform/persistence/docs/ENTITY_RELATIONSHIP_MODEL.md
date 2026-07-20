# Entity Relationship Model (Persistence)

Logical ER at persistence layer (payload shapes are consumer-defined):

```
organizations 1──* users
organizations 1──* teams / projects / brands / campaigns
organizations 1──* knowledge_repositories 1──* knowledge_documents
organizations 1──* executions 1──* execution_history
organizations 1──* experience / learning_artifacts / evaluation_reports
organizations 1──* subscriptions / invoices / audit_logs / notifications / settings
provider_catalog · model_registry · marketplace · templates · prompt_library
```

Physical storage is dialect-specific; logical keys remain `id` + `organizationId`.
