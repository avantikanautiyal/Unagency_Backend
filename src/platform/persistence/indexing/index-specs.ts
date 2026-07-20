/**
 * Indexing planner — builds index specs without OpenSearch.
 */

import type { EntityCollection } from "../contracts";

export interface IndexSpec {
  readonly indexName: string;
  readonly collection: EntityCollection;
  readonly fields: readonly string[];
}

export const DEFAULT_INDEX_SPECS: readonly IndexSpec[] = [
  { indexName: "organizations", collection: "organizations", fields: ["name"] },
  { indexName: "campaigns", collection: "campaigns", fields: ["name", "objective", "status"] },
  { indexName: "knowledge", collection: "knowledge_documents", fields: ["title", "body", "keywords"] },
  { indexName: "executions", collection: "executions", fields: ["status", "prompt"] },
  { indexName: "marketplace", collection: "marketplace", fields: ["name", "kind"] },
];
