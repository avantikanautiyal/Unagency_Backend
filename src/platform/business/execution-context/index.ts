/**
 * Execution context module — business → intelligence boundary.
 */

export type {
  ExecutionContextResolveInput,
  ExecutionContextIdentity,
  ExecutionContextScope,
  ExecutionBusinessContext,
  ExecutionContextTrace,
  ResolvedExecutionContextBundle,
} from "./contracts/execution-context";
export { ExecutionContextResolver } from "./execution-context-resolver";
export {
  createExecutionContextResolver,
  InMemoryExecutionContextStores,
} from "./factories/create-execution-context-resolver";
export { buildContextBuildRequest } from "./build-context-build-request";
export { mergeBusinessKnowledgeIntoSnapshot } from "./knowledge-context-adapter";
export type { IExecutionContextStores } from "./stores/execution-context-stores";
export {
  createLiveBusinessContextStores,
  LiveBusinessContextStores,
} from "./live";
// seedExecutionContextFixtures lives in ./testing/seed-fixtures — tests/control-plane only.
