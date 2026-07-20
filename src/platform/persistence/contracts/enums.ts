/**
 * Persistence enumerations.
 */

export type PersistenceDialect = "memory" | "postgres" | "mongodb" | "redis";

export type EntityCollection =
  | "organizations"
  | "users"
  | "teams"
  | "projects"
  | "brands"
  | "campaigns"
  | "knowledge_repositories"
  | "knowledge_documents"
  | "prompt_library"
  | "executions"
  | "execution_history"
  | "experience"
  | "learning_artifacts"
  | "evaluation_reports"
  | "provider_catalog"
  | "model_registry"
  | "marketplace"
  | "templates"
  | "subscriptions"
  | "invoices"
  | "audit_logs"
  | "notifications"
  | "settings";

export type MigrationEnvironment = "development" | "test" | "staging" | "production";

export type MigrationDirection = "up" | "down";

export type OutboxStatus = "pending" | "published" | "failed";

export type BackupKind = "full" | "incremental" | "snapshot";
