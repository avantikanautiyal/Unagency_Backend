/**
 * All entity collections supported by the persistence platform.
 */

import type { EntityCollection } from "../contracts";

export const ALL_ENTITY_COLLECTIONS: readonly EntityCollection[] = [
  "organizations",
  "users",
  "teams",
  "projects",
  "brands",
  "campaigns",
  "knowledge_repositories",
  "knowledge_documents",
  "prompt_library",
  "executions",
  "execution_history",
  "experience",
  "learning_artifacts",
  "evaluation_reports",
  "provider_catalog",
  "model_registry",
  "marketplace",
  "templates",
  "subscriptions",
  "invoices",
  "audit_logs",
  "notifications",
  "settings",
];
